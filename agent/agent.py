"""DataBased Windows agent.

Runs as a system-tray application. Heartbeats to the Pi, watches source
folders for new files, executes manual/scheduled syncs, and pushes
metrics. Quit from the tray menu.

Dev: `python agent.py [--config path/to/agent.json] [--no-tray]`
Build: see build.ps1 — produces a single-file .exe with no console window.
"""
# Defer evaluation of type annotations so the file parses on Python 3.8
# (Win7's last supported Python). Without this, `list[X]`, `dict[X, Y]`,
# `X | None` etc. raise TypeError at parse time on 3.8/3.9 respectively.
from __future__ import annotations
import argparse
import json
import logging
import os
import shutil
import socket
import subprocess
import sys
import threading
import time
import uuid
from typing import Optional
from datetime import datetime, timezone
from logging.handlers import RotatingFileHandler
from pathlib import Path

import psutil
import requests
from watchdog.events import FileSystemEventHandler

from watchdog.observers import Observer


AGENT_VERSION = "0.25.0"


def _agent_dir() -> Path:
    """Folder containing the running agent — the install dir when frozen
    (next to databased-agent.exe), or the agent/ source dir in dev mode.
    Using __file__ here would resolve to PyInstaller's _internal/ folder
    in onedir mode, which is wrong for user-facing files like agent.json."""
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


DEFAULT_CONFIG = _agent_dir() / "agent.json"
LOG_DIR = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "DataBased"


_logger = logging.getLogger("databased")


def setup_logging(verbose: bool) -> Path:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_path = LOG_DIR / "agent.log"
    fmt = logging.Formatter("%(asctime)s %(message)s", datefmt="%H:%M:%S")
    # encoding=utf-8 — Windows defaults to cp1252 which can't write '→' etc.
    fh = RotatingFileHandler(log_path, maxBytes=5_000_000, backupCount=3, encoding="utf-8")
    fh.setFormatter(fmt)
    _logger.addHandler(fh)
    if verbose:
        sh = logging.StreamHandler()
        sh.setFormatter(fmt)
        _logger.addHandler(sh)
    _logger.setLevel(logging.INFO)
    return log_path


def log(msg: str) -> None:
    _logger.info(msg)


def load_config(path: Path) -> dict | None:
    """Returns a valid cfg dict, or None if the file is missing/invalid
    (caller should run the wizard)."""
    if not path.exists():
        return None
    try:
        raw = path.read_text(encoding="utf-8-sig").strip()
    except OSError:
        return None
    if not raw:
        return None
    try:
        cfg = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not cfg.get("pi_url") or not cfg.get("computer_name"):
        return None
    # Support a list of alternate Pi URLs ('pi_url_alt') so the same agent
    # config works whether the Pi is on the home network or the lab network.
    # At first heartbeat we'll probe each one and switch cfg['pi_url'] to
    # whichever responds first. Stored as a comma-separated string for
    # JSON-friendliness; split here.
    raw_alt = cfg.get("pi_url_alt") or ""
    if isinstance(raw_alt, str):
        cfg["pi_url_alt"] = [u.strip().rstrip("/") for u in raw_alt.split(",") if u.strip()]
    elif isinstance(raw_alt, list):
        cfg["pi_url_alt"] = [u.strip().rstrip("/") for u in raw_alt if isinstance(u, str) and u.strip()]
    else:
        cfg["pi_url_alt"] = []
    cfg.setdefault("icon_type", "computer")
    cfg.setdefault("monitor_path", "C:\\" if os.name == "nt" else "/")
    cfg.setdefault("heartbeat_interval_seconds", 30)
    cfg.setdefault("poll_interval_seconds", 5)
    cfg.setdefault("metrics_interval_seconds", 5)
    # Auto-update: where to look for a newer databased-agent.exe.
    # Empty string = updates disabled.
    cfg.setdefault("update_source_path", "")
    cfg.setdefault("update_check_interval_seconds", 3600)  # hourly
    cfg.setdefault("watch_processes", "")  # comma-separated, pushed live by Pi
    cfg.setdefault("_last_update_request_seen", "")  # ephemeral; not persisted
    # Stable per-machine identifier — survives renames in the dashboard. Generated
    # on first run and persisted; once the orchestrator has it, lookups by id
    # take priority over computer_name so renaming on the dashboard doesn't
    # cause this agent to register as a new pending machine.
    if not cfg.get("agent_id"):
        cfg["agent_id"] = str(uuid.uuid4())
    cfg["pi_url"] = cfg["pi_url"].rstrip("/")
    return cfg


def save_config(path: Path, cfg: dict) -> None:
    """Persist cfg back to disk. Drops ephemeral keys; serializes pi_url_alt
    back to a comma-separated string to match the wizard's format."""
    out = {k: v for k, v in cfg.items() if not k.startswith("_")}
    if isinstance(out.get("pi_url_alt"), list):
        out["pi_url_alt"] = ",".join(out["pi_url_alt"])
    try:
        path.write_text(json.dumps(out, indent=2), encoding="utf-8")
    except OSError as exc:
        log(f"save_config failed: {exc}")


def local_ip() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return socket.gethostbyname(socket.gethostname())
    finally:
        s.close()


def storage_used_gb(path: str) -> float:
    try:
        usage = psutil.disk_usage(path)
        return round((usage.total - usage.free) / (1024 ** 3), 2)
    except OSError:
        return 0.0


def system_uptime_seconds() -> int:
    return int(time.time() - psutil.boot_time())


def user_idle_seconds() -> float | None:
    """Seconds since the last input event (mouse, keyboard, touch). Windows-only.
    Returns None when the call fails or on non-Windows hosts."""
    if os.name != "nt":
        return None
    try:
        import ctypes

        class _LASTINPUTINFO(ctypes.Structure):
            _fields_ = [("cbSize", ctypes.c_uint), ("dwTime", ctypes.c_uint)]

        lii = _LASTINPUTINFO()
        lii.cbSize = ctypes.sizeof(lii)
        if not ctypes.windll.user32.GetLastInputInfo(ctypes.byref(lii)):
            return None
        millis_since_boot = ctypes.windll.kernel32.GetTickCount()
        return max(0, (millis_since_boot - lii.dwTime) / 1000.0)
    except Exception:  # noqa: BLE001
        return None


# Most-recent watch-handler event across all WatchedJob instances. Used as a
# "data is being written" proxy in the metrics payload. Updated by WatchedJob
# on each filesystem event.
_last_file_event_ts: float | None = None
_last_file_event_lock = threading.Lock()


def _bump_file_event() -> None:
    global _last_file_event_ts
    with _last_file_event_lock:
        _last_file_event_ts = time.time()


def _file_event_seconds_ago() -> float | None:
    with _last_file_event_lock:
        if _last_file_event_ts is None:
            return None
        return max(0.0, time.time() - _last_file_event_ts)


# ---------- HTTP helpers ----------

def _candidate_pi_urls(cfg: dict) -> list[str]:
    """All Pi URLs we might try, primary first then any alts."""
    urls = []
    primary = (cfg.get("pi_url") or "").strip().rstrip("/")
    if primary:
        urls.append(primary)
    for alt in (cfg.get("pi_url_alt") or []):
        alt = (alt or "").strip().rstrip("/")
        if alt and alt not in urls:
            urls.append(alt)
    return urls


def find_reachable_pi(cfg: dict, timeout: float = 2.5) -> Optional[str]:
    """Probe each candidate URL for /api/health. Returns the first that
    responds, or None. Quick timeout so we don't stall the heartbeat loop
    for long when neither network is up."""
    for url in _candidate_pi_urls(cfg):
        try:
            r = requests.get(f"{url}/api/health", timeout=timeout)
            if r.ok:
                return url
        except requests.RequestException:
            continue
    return None


def _ensure_active_pi(cfg: dict) -> None:
    """If the primary cfg['pi_url'] is unreachable, try the alts and switch
    cfg['pi_url'] to whichever responds. Called before each HTTP call so
    the agent recovers automatically after the Pi moves networks."""
    primary = (cfg.get("pi_url") or "").strip().rstrip("/")
    alts = cfg.get("pi_url_alt") or []
    if not alts:
        return  # single-URL config — nothing to fall back to
    try:
        r = requests.get(f"{primary}/api/health", timeout=2.5)
        if r.ok:
            return  # primary is fine
    except requests.RequestException:
        pass
    # Primary down — try alts.
    for alt in alts:
        if alt == primary:
            continue
        try:
            r = requests.get(f"{alt}/api/health", timeout=2.5)
            if r.ok:
                log(f"pi_url switch: {primary} unreachable → using {alt}")
                # Promote alt to primary, demote previous primary into the alt list.
                cfg["pi_url"] = alt
                cfg["pi_url_alt"] = [primary] + [u for u in alts if u != alt]
                return
        except requests.RequestException:
            continue


def post(cfg: dict, route: str, payload: dict) -> dict:
    _ensure_active_pi(cfg)
    r = requests.post(f"{cfg['pi_url']}{route}", json=payload, timeout=10)
    r.raise_for_status()
    return r.json()


def get(cfg: dict, route: str, params: dict | None = None) -> dict:
    _ensure_active_pi(cfg)
    r = requests.get(f"{cfg['pi_url']}{route}", params=params, timeout=10)
    r.raise_for_status()
    return r.json()


# ---------- Heartbeat ----------

def heartbeat_once(cfg: dict) -> dict:
    payload = {
        "computer_name": cfg["computer_name"],
        "agent_id": cfg.get("agent_id"),
        "ip_address": local_ip(),
        "agent_version": AGENT_VERSION,
        "uptime_seconds": system_uptime_seconds(),
        "storage_used_gb": storage_used_gb(cfg["monitor_path"]),
        "icon_type": cfg["icon_type"],
        # Only honored on first registration; dashboard owns the value after that.
        "is_file_server": bool(cfg.get("is_file_server", False)),
    }
    return post(cfg, "/agent/heartbeat", payload)


def _absorb_identity(cfg: dict, response: dict) -> bool:
    """Update cfg in place when the orchestrator returned a canonical
    `agent_id` that differs from ours. Returns True if anything changed
    (caller persists).

    The dashboard `name` is purely a display label; we deliberately never
    overwrite the agent's local `computer_name` so the agent's identity
    on this machine (logs, agent.json, file paths) stays stable across
    dashboard renames."""
    srv_id = (response.get("agent_id") or "").strip()
    if srv_id and srv_id != (cfg.get("agent_id") or ""):
        cfg["agent_id"] = srv_id
        return True
    return False


def heartbeat_loop(cfg: dict, state=None) -> None:
    while True:
        try:
            r = heartbeat_once(cfg)
            log(f"heartbeat ok — Pi says status={r.get('status')}")
            if _absorb_identity(cfg, r):
                path = cfg.get("_config_path")
                if path:
                    save_config(path, cfg)
            if state:
                state.set(connected=True, last_heartbeat_ago="just now", last_error=None)
        except Exception as exc:  # noqa: BLE001
            log(f"heartbeat failed: {exc}")
            if state:
                state.set(connected=False, last_error=str(exc)[:80])
        time.sleep(cfg["heartbeat_interval_seconds"])


# ---------- Metrics ----------

def _ps_json(script: str, timeout: int = 8):
    """Run a PowerShell snippet and return the parsed JSON, or None on any
    failure. Used for non-admin Storage Spaces / physical-disk queries on the
    file server. PowerShell is bundled with every supported Windows."""
    if os.name != "nt":
        return None
    try:
        # `-Command` reads the script string directly. Wrap user data in
        # ConvertTo-Json with -Compress so we get a compact single-line blob.
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
            capture_output=True, text=True, timeout=timeout,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
        )
        out = (proc.stdout or "").strip()
        if not out:
            return None
        return json.loads(out)
    except (subprocess.TimeoutExpired, OSError, json.JSONDecodeError):
        return None


def collect_primary_link() -> Optional[dict]:
    """Best-guess summary of the network link the agent is using to reach the
    Pi. Picks the interface whose address matches local_ip(); falls back to the
    first interface that's up, has a non-loopback IPv4, and isn't named like a
    virtual switch. Reports name, link type guess (ethernet/wifi/other),
    speed in Mbps, isup, and duplex. Returns None if nothing usable is found."""
    try:
        target_ip = local_ip()
    except OSError:
        target_ip = ""
    addrs = psutil.net_if_addrs()
    stats = psutil.net_if_stats()

    def _classify(name: str) -> str:
        n = name.lower()
        if any(s in n for s in ("wi-fi", "wifi", "wlan", "wireless")):
            return "wifi"
        if any(s in n for s in ("eth", "ethernet", "lan", "local area")):
            return "ethernet"
        if any(s in n for s in ("vbox", "vmware", "vethernet", "loopback", "bluetooth", "tap-")):
            return "virtual"
        return "other"

    def _shape(name: str) -> Optional[dict]:
        st = stats.get(name)
        if st is None or not st.isup:
            return None
        return {
            "name": name,
            "type": _classify(name),
            "speed_mbps": st.speed if st.speed > 0 else None,
            "duplex": str(st.duplex).rsplit(".", 1)[-1].lower() if st.duplex else None,
            "isup": True,
        }

    # 1. Try to match the interface that owns target_ip.
    if target_ip:
        for name, ifaces in addrs.items():
            if any(a.address == target_ip for a in ifaces):
                shaped = _shape(name)
                if shaped:
                    return shaped

    # 2. Fallback — first 'real' interface that's up.
    for name in addrs:
        cls = _classify(name)
        if cls == "virtual":
            continue
        has_ipv4 = any(a.family.name == "AF_INET" and not a.address.startswith("127.")
                       for a in addrs[name] if hasattr(a.family, "name"))
        if not has_ipv4:
            continue
        shaped = _shape(name)
        if shaped:
            return shaped
    return None


def _strip_exe(name: str) -> str:
    """Lowercase + drop a trailing '.exe'. Replaces str.removesuffix (3.9+)
    so the agent can build under Python 3.8 for Windows 7 hosts."""
    n = name.lower()
    return n[:-4] if n.endswith(".exe") else n


def collect_watched_processes(names: list[str]) -> list[dict]:
    """For each requested name, report whether at least one matching process
    is currently running. Match is case-insensitive, with or without `.exe`.
    Returns [] if `names` is empty."""
    if not names:
        return []
    wanted = {_strip_exe(n.strip()) for n in names if n.strip()}
    if not wanted:
        return []
    found: dict[str, dict] = {n: {"name": n, "running": False, "pid": None} for n in wanted}
    for proc in psutil.process_iter(["name", "pid", "create_time"]):
        try:
            raw = _strip_exe(proc.info.get("name") or "")
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        if raw in wanted and not found[raw]["running"]:
            found[raw] = {
                "name": raw,
                "running": True,
                "pid": proc.info.get("pid"),
                "started_at": proc.info.get("create_time"),
            }
    return list(found.values())


def collect_storage_detail():
    """File-server-only: physical disks + storage pools + volumes via the
    free Windows Storage cmdlets. No admin needed for any of these.

    Returns a dict with shape:
      { "physical_disks": [...], "storage_pools": [...], "virtual_disks": [...] }
    or None if PowerShell isn't available or all queries fail."""
    if os.name != "nt":
        return None

    physical = _ps_json(
        "Get-PhysicalDisk | Select-Object FriendlyName,SerialNumber,MediaType,"
        "BusType,SpindleSpeed,Size,HealthStatus,OperationalStatus,Usage "
        "| ConvertTo-Json -Compress -Depth 3"
    )
    pools = _ps_json(
        "Get-StoragePool -ErrorAction SilentlyContinue | Where-Object { -not $_.IsPrimordial } "
        "| Select-Object FriendlyName,Size,AllocatedSize,HealthStatus,OperationalStatus,"
        "ResiliencySettingNameDefault | ConvertTo-Json -Compress -Depth 3"
    )
    virtual = _ps_json(
        "Get-VirtualDisk -ErrorAction SilentlyContinue "
        "| Select-Object FriendlyName,Size,AllocatedSize,FootprintOnPool,HealthStatus,"
        "OperationalStatus,ResiliencySettingName,NumberOfColumns | ConvertTo-Json -Compress -Depth 3"
    )

    def _as_list(x):
        if x is None: return []
        return x if isinstance(x, list) else [x]

    return {
        "physical_disks": _as_list(physical),
        "storage_pools": _as_list(pools),
        "virtual_disks": _as_list(virtual),
    }


class MetricsCollector:
    """Snapshots system stats. Tracks last-sample counters for delta-based
    metrics (network throughput, disk IO rate).

    `is_file_server=True` enables the slower Storage Spaces / physical-disk
    collector, cached for STORAGE_DETAIL_TTL so we don't spawn PowerShell
    every metrics tick (typically every 5 s)."""

    STORAGE_DETAIL_TTL = 300  # 5 min

    def __init__(self, is_file_server: bool = False, cfg: Optional[dict] = None):
        self._last_net = psutil.net_io_counters()
        self._last_disk = psutil.disk_io_counters() if hasattr(psutil, "disk_io_counters") else None
        self._last_at = time.time()
        self._is_file_server = is_file_server
        self._cfg = cfg or {}
        self._storage_detail = None
        self._storage_detail_at = 0.0
        # Prime per-core CPU so the first real call returns deltas, not 0.
        psutil.cpu_percent(interval=None, percpu=True)
        psutil.cpu_percent(interval=None)

    def _maybe_storage_detail(self):
        if not self._is_file_server:
            return None
        now = time.time()
        if (now - self._storage_detail_at) < self.STORAGE_DETAIL_TTL and self._storage_detail is not None:
            return self._storage_detail
        try:
            self._storage_detail = collect_storage_detail()
        except Exception as exc:  # noqa: BLE001
            log(f"storage detail collect failed: {exc}")
            self._storage_detail = None
        self._storage_detail_at = now
        return self._storage_detail

    def collect(self) -> dict:
        now = time.time()
        elapsed = max(0.001, now - self._last_at)

        # CPU
        per_core = psutil.cpu_percent(interval=None, percpu=True)
        overall = psutil.cpu_percent(interval=None)
        try:
            freq = psutil.cpu_freq()
            freq_mhz = round(freq.current, 0) if freq else None
        except (NotImplementedError, OSError):
            freq_mhz = None

        # Memory
        vm = psutil.virtual_memory()

        # Disks per partition (skip pseudo-fs)
        disks = []
        for part in psutil.disk_partitions(all=False):
            try:
                u = psutil.disk_usage(part.mountpoint)
                disks.append({
                    "mount": part.mountpoint,
                    "device": part.device,
                    "fstype": part.fstype,
                    "total_gb": round(u.total / 1024**3, 1),
                    "used_gb": round(u.used / 1024**3, 1),
                    "percent": u.percent,
                })
            except OSError:
                continue

        # Network throughput (Kbps) — delta over elapsed
        net = psutil.net_io_counters()
        sent_kbps = max(0, (net.bytes_sent - self._last_net.bytes_sent) * 8 / 1024 / elapsed)
        recv_kbps = max(0, (net.bytes_recv - self._last_net.bytes_recv) * 8 / 1024 / elapsed)
        self._last_net = net

        # Disk IO rate (MB/s aggregate)
        disk_io = None
        if self._last_disk is not None:
            try:
                d = psutil.disk_io_counters()
                if d is not None:
                    disk_io = {
                        "read_mbps": max(0, (d.read_bytes - self._last_disk.read_bytes) / 1024**2 / elapsed),
                        "write_mbps": max(0, (d.write_bytes - self._last_disk.write_bytes) / 1024**2 / elapsed),
                    }
                    self._last_disk = d
            except OSError:
                pass

        # Process count is cheap — just enumerate PIDs, no per-process syscalls.
        # Thread/handle aggregates are expensive on Windows (per-proc kernel calls
        # × 300+ processes can take 100+s); we let Task Manager handle those.
        proc_count = len(psutil.pids())

        self._last_at = now

        return {
            "ts": datetime.now(timezone.utc).isoformat(),
            "cpu": {
                "overall": round(overall, 1),
                "per_core": [round(c, 1) for c in per_core],
                "freq_mhz": freq_mhz,
                "cores": len(per_core),
            },
            "memory": {
                "total_gb": round(vm.total / 1024**3, 1),
                "used_gb": round((vm.total - vm.available) / 1024**3, 1),
                "percent": vm.percent,
            },
            "disks": disks,
            "disk_io": disk_io,
            "network": {
                "sent_kbps": round(sent_kbps, 1),
                "recv_kbps": round(recv_kbps, 1),
            },
            "processes": proc_count,
            "threads": None,  # too slow to compute per-cycle on Windows
            "handles": None,
            "uptime_seconds": int(time.time() - psutil.boot_time()),
            # Activity signals — used by the dashboard "IN USE" badge.
            # idle_seconds is None on non-Windows or if the API call fails.
            # last_file_event_seconds is None until a watch-mode event has fired
            # since this agent started.
            "idle_seconds": user_idle_seconds(),
            "last_file_event_seconds": _file_event_seconds_ago(),
            # File-server-only — None on non-FS agents. Cached at 5-min cadence
            # internally so this dict is cheap to include every tick.
            "storage_detail": self._maybe_storage_detail(),
            # Pi pushes the watched-process list via /agent/config; we re-read
            # it from cfg on every tick so dashboard edits propagate cleanly.
            "watched_processes": collect_watched_processes(
                [p for p in (self._cfg.get("watch_processes") or "").split(",")]
            ),
            "primary_link": collect_primary_link(),
        }


def metrics_loop(cfg: dict) -> None:
    collector = MetricsCollector(
        is_file_server=bool(cfg.get("is_file_server", False)),
        cfg=cfg,  # cfg is mutated in place by fetch_config so the watchdog list stays fresh
    )
    while True:
        try:
            payload = collector.collect()
            payload["computer_name"] = cfg["computer_name"]
            payload["agent_id"] = cfg.get("agent_id")
            post(cfg, "/agent/metrics", payload)
        except Exception as exc:  # noqa: BLE001
            log(f"metrics push failed: {exc}")
        time.sleep(cfg["metrics_interval_seconds"])


# ---------- Sync execution ----------

def resolve_conflict(src: Path, dst: Path, mode: str) -> Path | None:
    """Return the path to write to, or None to skip."""
    if not dst.exists():
        return dst
    if mode == "skip":
        return None
    if mode == "skip-if-same-size":
        try:
            if src.stat().st_size == dst.stat().st_size:
                return None
        except OSError:
            pass
        return dst  # sizes differ — overwrite
    if mode == "version-number":
        n = 1
        while True:
            candidate = dst.with_name(f"{dst.stem}_v{n}{dst.suffix}")
            if not candidate.exists():
                return candidate
            n += 1
    if mode == "timestamp-suffix":
        ts = datetime.now().strftime("%Y-%m-%d-%H%M%S")
        return dst.with_name(f"{dst.stem}_{ts}{dst.suffix}")
    return None


def execute_sync(job: dict, cfg: dict, *, log_id: int | None = None,
                 triggered_by: str = "manual") -> None:
    """Run one sync. If `log_id` is set, updates that pending log row.
    Otherwise creates a fresh log entry (watch-mode flow).
    """
    source = Path(job["source_folder_path"])
    target = Path(job["target_folder_path"])
    mode = job.get("conflict_handling", "skip")
    started_at = datetime.now(timezone.utc).isoformat()

    log(f"sync start [{triggered_by}]: job={job.get('name')!r} src={source} → dst={target}")

    def _report(status, copied=0, skipped=0, failed=0, err=None, file_list=None):
        payload = {
            "status": status,
            "files_copied": copied,
            "files_skipped": skipped,
            "files_failed": failed,
            "error_message": err,
            "file_list": file_list,
            "completed_at": datetime.now(timezone.utc).isoformat(),
        }
        if log_id is not None:
            payload["log_id"] = log_id
        else:
            payload["job_id"] = job["id"]
            payload["triggered_by"] = triggered_by
            payload["started_at"] = started_at
        try:
            post(cfg, "/agent/log", payload)
        except Exception as exc:  # noqa: BLE001
            log(f"  ! failed to report log: {exc}")

    if not source.exists() or not source.is_dir():
        _report("failed", err=f"source not found: {source}")
        log("  ✗ source missing")
        return

    target.mkdir(parents=True, exist_ok=True)

    direction = (job.get("sync_direction") or "one-way").lower()

    copied = skipped = failed = deleted = 0
    errors: list[str] = []
    # Track per-file outcomes for the dashboard's expanded log view.
    # Format: "<symbol> <relative-path>" — symbols: + copied, ~ skipped,
    # x failed, - deleted (mirror/move).
    file_lines: list[str] = []
    # Source-relative paths that successfully copied — used by 'move' to delete
    # source after, and by 'mirror' to know which target paths to keep.
    copied_rels: set[str] = set()
    seen_source_rels: set[str] = set()
    MAX_LIST = 1000

    for src_file in source.rglob("*"):
        if not src_file.is_file():
            continue
        rel = src_file.relative_to(source)
        rel_str = str(rel).replace("\\", "/")
        seen_source_rels.add(rel_str)
        dst_file = target / rel
        dst_file.parent.mkdir(parents=True, exist_ok=True)
        write_path = resolve_conflict(src_file, dst_file, mode)
        if write_path is None:
            skipped += 1
            copied_rels.add(rel_str)  # already-mirrored files count as in-target
            if len(file_lines) < MAX_LIST:
                file_lines.append(f"~ {rel_str}")
            continue
        try:
            shutil.copy2(src_file, write_path)
            copied += 1
            copied_rels.add(rel_str)
            if len(file_lines) < MAX_LIST:
                file_lines.append(f"+ {rel_str}")
        except (OSError, PermissionError) as exc:
            failed += 1
            errors.append(f"{src_file}: {exc}")
            if len(file_lines) < MAX_LIST:
                file_lines.append(f"x {rel_str}")

    # Mirror: delete files from target that no longer exist in source.
    if direction == "mirror" and target.exists():
        for tgt_file in target.rglob("*"):
            if not tgt_file.is_file():
                continue
            try:
                rel = tgt_file.relative_to(target)
            except ValueError:
                continue
            rel_str = str(rel).replace("\\", "/")
            if rel_str in seen_source_rels:
                continue
            try:
                tgt_file.unlink()
                deleted += 1
                if len(file_lines) < MAX_LIST:
                    file_lines.append(f"- {rel_str}")
            except OSError as exc:
                failed += 1
                errors.append(f"delete {tgt_file}: {exc}")

    # Move: delete source files after a confirmed copy (or already-mirrored skip).
    # Only deletes paths that are now safely in target; failures stay put.
    if direction == "move":
        for rel_str in copied_rels:
            src_path = source / rel_str
            try:
                src_path.unlink()
                deleted += 1
                # Tag with a different glyph in the file list so review is clear.
                # Replace the most recent matching '+'/'~' line with '> path'.
                for i, line in enumerate(file_lines):
                    if line[2:] == rel_str and line[0] in "+~":
                        file_lines[i] = f"> {rel_str}"
                        break
            except OSError as exc:
                failed += 1
                errors.append(f"move-delete {src_path}: {exc}")

    if failed == 0:
        status, err = "success", None
    elif copied > 0:
        status, err = "warning", f"{failed} files failed; first error: {errors[0]}"
    else:
        status, err = "failed", (errors[0] if errors else "all files failed")

    total_seen = copied + skipped + failed
    if total_seen > MAX_LIST:
        file_lines.append(f"… (+{total_seen - MAX_LIST} more files not shown)")

    _report(status, copied, skipped, failed, err, file_list="\n".join(file_lines) if file_lines else None)
    log(f"  ✓ {status}: copied={copied} skipped={skipped} failed={failed} deleted={deleted} (mode={direction})")


# ---------- Internet tunnel ----------

# Default port the Pi's tinyproxy listens on. Override via cfg["internet_tunnel_port"].
DEFAULT_TUNNEL_PORT = 8888
DEFAULT_TUNNEL_HOMEPAGE = "https://duckduckgo.com"

# Where Windows usually installs Chromium browsers. We pick the first that
# exists. Edge ships with Win10/11 so it's almost always present.
_BROWSER_CANDIDATES_WIN = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files\BraveSoftware\Brave-Browser\Application\brave.exe",
]


def _pi_host_from_url(pi_url: str) -> str:
    """Extract just the host from cfg['pi_url'] (e.g. http://10.0.0.5:5000 → 10.0.0.5)."""
    from urllib.parse import urlparse
    return urlparse(pi_url).hostname or ""


def _find_chromium_browser() -> Optional[Path]:
    if os.name != "nt":
        return None
    for candidate in _BROWSER_CANDIDATES_WIN:
        p = Path(candidate)
        if p.exists():
            return p
    return None


def open_internet_tunnel(cfg: dict) -> tuple[bool, str]:
    """Launch a Chromium browser pointed at the Pi's HTTP proxy.

    Closing the browser closes the 'tunnel' — no system proxy is touched, so
    other apps and the agent itself are unaffected. Uses --user-data-dir on
    a temp folder so the tunneled session is isolated from any existing
    browser profile.

    Returns (ok, message)."""
    browser = _find_chromium_browser()
    if browser is None:
        return False, "No Chromium browser found (Edge, Chrome, or Brave)."

    pi_host = _pi_host_from_url(cfg.get("pi_url", ""))
    if not pi_host:
        return False, "Could not derive Pi host from pi_url."

    port = int(cfg.get("internet_tunnel_port") or DEFAULT_TUNNEL_PORT)
    homepage = cfg.get("internet_tunnel_homepage") or DEFAULT_TUNNEL_HOMEPAGE
    proxy = f"http://{pi_host}:{port}"

    # Isolated profile in a temp dir so the tunneled session is clearly separate
    # from anything the user has open already. Browser auto-removes user_data_dir
    # on close? No — but it's small and Windows %TEMP% is purged eventually.
    import tempfile
    profile_dir = Path(tempfile.mkdtemp(prefix="databased-tunnel-"))

    try:
        subprocess.Popen(
            [
                str(browser),
                f"--proxy-server={proxy}",
                f"--user-data-dir={profile_dir}",
                "--no-first-run",
                "--no-default-browser-check",
                "--new-window",
                homepage,
            ],
            close_fds=True,
            creationflags=getattr(subprocess, "DETACHED_PROCESS", 0) | getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0),
        )
        log(f"tunnel: launched {browser.name} → {proxy}")
        return True, f"Browser opened — traffic routes through {proxy}. Close the browser to end the tunnel."
    except OSError as exc:
        return False, f"failed to launch browser: {exc}"


# ---------- Auto-update ----------

# Stay-fresh threshold: ignore folders whose exe was modified less than this
# long ago, so we don't grab a half-finished build mid-copy.
UPDATE_MIN_AGE_SECONDS = 60
UPDATE_EXE_NAME = "databased-agent.exe"
UPDATE_FOLDER_NAME = "databased-agent"

# Files to preserve across folder swaps (user state that lives in the install
# folder next to the exe). agent.last.json is the wizard's pre-fill cache.
PRESERVED_FILES = ("agent.json", "agent.last.json")


def _exe_path() -> Optional[Path]:
    """Path of the running exe — only meaningful when frozen by PyInstaller."""
    if not getattr(sys, "frozen", False):
        return None
    return Path(sys.executable).resolve()


def check_for_update(cfg: dict) -> Optional[Path]:
    """Returns the path to a newer install folder on the NAS, or None.

    Expected NAS layout (onedir):
        <update_source_path>/databased-agent/databased-agent.exe
        <update_source_path>/databased-agent/python311.dll
        <update_source_path>/databased-agent/_internal/...
    """
    src_dir = (cfg.get("update_source_path") or "").strip()
    if not src_dir:
        return None
    current = _exe_path()
    if current is None:
        return None  # dev mode (python script) — skip auto-update
    try:
        # Probe for the new onedir layout first (folder containing the exe).
        candidate_folder = Path(src_dir) / UPDATE_FOLDER_NAME
        candidate_exe = candidate_folder / UPDATE_EXE_NAME
        if not candidate_exe.exists():
            return None
        cand_mtime = candidate_exe.stat().st_mtime
        cur_mtime = current.stat().st_mtime
        if cand_mtime <= cur_mtime:
            return None
        # Don't grab a build that's still being written
        if (time.time() - cand_mtime) < UPDATE_MIN_AGE_SECONDS:
            return None
        # Sanity: must be a real exe, not empty
        if candidate_exe.stat().st_size < 1024 * 1024:
            return None
        return candidate_folder
    except OSError as exc:
        log(f"update: check failed: {exc}")
        return None


def apply_update(src_folder: Path) -> None:
    """Copy the new install folder locally, write update.bat, spawn it
    detached, exit. The bat waits for our process to exit, swaps the folder
    while preserving user files (agent.json), then relaunches."""
    current_exe = _exe_path()
    if current_exe is None:
        return
    install_dir = current_exe.parent       # e.g. C:\...\databased-agent\
    parent_dir = install_dir.parent        # e.g. C:\...\
    staging_dir = parent_dir / (install_dir.name + ".new")
    backup_dir = parent_dir / (install_dir.name + ".old")
    bat_path = parent_dir / "_databased_update.bat"
    log_dir = LOG_DIR

    # Stage the new build alongside the install dir. shutil.copytree handles
    # the folder copy from the NAS share.
    try:
        if staging_dir.exists():
            shutil.rmtree(staging_dir, ignore_errors=True)
        shutil.copytree(src_folder, staging_dir)
    except OSError as exc:
        log(f"update: stage copy failed: {exc}")
        return

    new_exe = staging_dir / current_exe.name
    if not new_exe.exists():
        log(f"update: staged folder is missing {current_exe.name}")
        return

    # Bat orchestrates the swap. We rename the install dir aside (rather than
    # delete) so we can restore on failure. Renames need the running process
    # to have released its handles, so we spin until that succeeds.
    preserve_lines = []
    for fname in PRESERVED_FILES:
        src = install_dir / fname
        # Save into staging_dir so the new install picks them up after rename.
        # `if exist` makes both lines safe for fresh installs missing these.
        preserve_lines.append(f'if exist "{src}" copy /y "{src}" "{staging_dir / fname}" >nul')

    preserve_block = "\r\n".join(preserve_lines) + "\r\n"

    bat_body = (
        "@echo off\r\n"
        "setlocal\r\n"
        # CRITICAL: cd to the parent dir so we're not holding the install_dir
        # open as our CWD — otherwise the rename below can never succeed and
        # the wait loop spins forever. %SystemRoot% is always renameable-safe.
        f'cd /d "%SystemRoot%"\r\n'
        "ping 127.0.0.1 -n 4 >nul\r\n"
        # Pre-clean any stale .old folder from a previous update that didn't
        # finish cleanup — otherwise `ren install_dir → .old` fails forever
        # because the destination already exists.
        f'if exist "{backup_dir}" rmdir /s /q "{backup_dir}" 2>nul\r\n'
        # Step 1: copy preserved user files INTO the staging folder so they
        # survive the rename below.
        f"{preserve_block}"
        # Step 2: wait (with bounded retries) for the install dir to unlock.
        # 30 attempts × ~2s = ~1 minute hard cap, then give up rather than
        # spinning forever in a popup-ping loop.
        f'set /a tries=0\r\n'
        ":wait\r\n"
        f'ren "{install_dir}" "{backup_dir.name}" 2>nul\r\n'
        f'if not exist "{install_dir}" goto promote\r\n'
        f'set /a tries+=1\r\n'
        f'if %tries% geq 30 (\r\n'
        f'  echo update: gave up waiting for install dir to unlock >> "{log_dir / "update.log"}"\r\n'
        f'  exit /b 2\r\n'
        f')\r\n'
        f'ping 127.0.0.1 -n 2 >nul\r\n'
        f'goto wait\r\n'
        # Step 3: promote the staging folder.
        ":promote\r\n"
        f'ren "{staging_dir}" "{install_dir.name}"\r\n'
        f'if errorlevel 1 (\r\n'
        f'  echo update: rename failed, rolling back >> "{log_dir / "update.log"}"\r\n'
        f'  ren "{backup_dir}" "{install_dir.name}" 2>nul\r\n'
        f'  exit /b 1\r\n'
        f')\r\n'
        # Step 4: launch the new exe and clean up the backup async.
        f'echo updated at %date% %time% >> "{log_dir / "update.log"}"\r\n'
        f'start "" "{current_exe}"\r\n'
        f'rmdir /s /q "{backup_dir}" 2>nul\r\n'
        # Self-delete (Windows trick: redirect cmd's read of itself to NUL)
        f'(goto) 2>nul & del "%~f0"\r\n'
    )
    try:
        bat_path.write_text(bat_body, encoding="utf-8")
    except OSError as exc:
        log(f"update: writing bat failed: {exc}")
        return

    log(f"update: applying {src_folder} → relaunching")
    try:
        DETACHED_PROCESS = 0x00000008
        CREATE_NEW_PROCESS_GROUP = 0x00000200
        flags = DETACHED_PROCESS | CREATE_NEW_PROCESS_GROUP if os.name == "nt" else 0
        # cwd= forces cmd.exe to NOT inherit the agent's CWD (which is the
        # install_dir). Without this the bat would hold its own parent open
        # and the rename inside the bat would never succeed.
        spawn_cwd = os.environ.get("SystemRoot", "C:\\") if os.name == "nt" else "/"
        subprocess.Popen(
            ["cmd", "/c", str(bat_path)] if os.name == "nt" else ["bash", str(bat_path)],
            close_fds=True,
            creationflags=flags,
            cwd=spawn_cwd,
        )
    except Exception as exc:  # noqa: BLE001
        log(f"update: spawn failed: {exc}")
        return

    # Give the bat a moment, then exit cleanly so it can rename our folder.
    time.sleep(1)
    os._exit(0)


def update_loop(cfg: dict) -> None:
    """Background thread: periodically check NAS for a newer exe."""
    # Initial check happens during main() before this loop starts.
    while True:
        time.sleep(int(cfg.get("update_check_interval_seconds", 3600)))
        try:
            new = check_for_update(cfg)
            if new:
                apply_update(new)
        except Exception as exc:  # noqa: BLE001
            log(f"update loop: {exc}")


# ---------- Pre-sync analysis ----------

ANALYZE_MAX_FILES = 200_000
ANALYZE_MAX_SECONDS = 90


def analyze_folder(path: Path) -> dict:
    """Walk `path`, count files + bytes + extensions. Capped to keep huge
    accidental selections (e.g. C:\\) from hanging the agent."""
    start = time.time()
    file_count = 0
    total_bytes = 0
    largest_path = None
    largest_size = 0
    ext_counts: dict[str, int] = {}
    truncated = False

    if not path.exists() or not path.is_dir():
        return {
            "status": "failed",
            "error": f"folder not found: {path}",
            "file_count": 0, "total_bytes": 0,
            "extensions": "{}",
            "truncated": False,
        }

    try:
        for f in path.rglob("*"):
            if not f.is_file():
                continue
            try:
                sz = f.stat().st_size
            except OSError:
                continue
            file_count += 1
            total_bytes += sz
            if sz > largest_size:
                largest_size = sz
                largest_path = str(f.relative_to(path)).replace("\\", "/")
            ext = f.suffix.lower() or "(no ext)"
            ext_counts[ext] = ext_counts.get(ext, 0) + 1
            if file_count >= ANALYZE_MAX_FILES or (time.time() - start) > ANALYZE_MAX_SECONDS:
                truncated = True
                break
    except (OSError, PermissionError) as exc:
        return {
            "status": "failed",
            "error": str(exc)[:500],
            "file_count": file_count, "total_bytes": total_bytes,
            "extensions": json.dumps(ext_counts),
            "truncated": truncated,
        }

    top_exts = dict(sorted(ext_counts.items(), key=lambda kv: -kv[1])[:12])
    return {
        "status": "complete",
        "file_count": file_count,
        "total_bytes": total_bytes,
        "largest_file": largest_path,
        "largest_file_bytes": largest_size,
        "extensions": json.dumps(top_exts),
        "truncated": truncated,
    }


def analyze_pending_jobs(cfg: dict) -> None:
    try:
        data = get(cfg, "/agent/jobs-pending-analysis", {"computer_name": cfg["computer_name"], "agent_id": cfg.get("agent_id", "")})
    except Exception as exc:  # noqa: BLE001
        log(f"analyze: fetch failed: {exc}")
        return
    jobs = data.get("jobs", [])
    if not jobs:
        return
    for j in jobs:
        log(f"analyze: scanning job_id={j['id']} {j['source_folder_path']}")
        result = analyze_folder(Path(j["source_folder_path"]))
        result["job_id"] = j["id"]
        try:
            post(cfg, "/agent/job-analysis", result)
            log(f"analyze: job_id={j['id']} done — {result.get('file_count', 0)} files, "
                f"{result.get('total_bytes', 0) // (1024**2)} MB"
                + (" (truncated)" if result.get("truncated") else ""))
        except Exception as exc:  # noqa: BLE001
            log(f"analyze: post failed for job_id={j['id']}: {exc}")


# ---------- Pre-sync comparison ----------

COMPARE_MAX_FILES = 200_000
COMPARE_MAX_SECONDS = 90
COMPARE_LIST_CAP = 500  # per-category file list cap returned to the dashboard


def compare_folders(source: Path, target: Path) -> dict:
    """Walk source vs target. Categorize files: new / changed / unchanged.
    Lists are capped to COMPARE_LIST_CAP; counts are exact (up to time/file caps).
    """
    start = time.time()
    new_files: list[dict] = []
    changed_files: list[dict] = []
    unchanged_files: list[dict] = []
    new_count = changed_count = unchanged_count = 0
    truncated = False

    if not source.exists() or not source.is_dir():
        return {
            "status": "failed",
            "error_message": f"source not found: {source}",
        }

    target_exists = target.exists() and target.is_dir()
    seen = 0

    try:
        for src_file in source.rglob("*"):
            if not src_file.is_file():
                continue
            seen += 1
            try:
                src_size = src_file.stat().st_size
            except OSError:
                continue
            rel = str(src_file.relative_to(source)).replace("\\", "/")

            if target_exists:
                dst_file = target / src_file.relative_to(source)
                if dst_file.exists():
                    try:
                        dst_size = dst_file.stat().st_size
                    except OSError:
                        dst_size = -1
                    if dst_size == src_size:
                        unchanged_count += 1
                        if len(unchanged_files) < COMPARE_LIST_CAP:
                            unchanged_files.append({"path": rel, "size": src_size})
                    else:
                        changed_count += 1
                        if len(changed_files) < COMPARE_LIST_CAP:
                            changed_files.append({"path": rel, "src_size": src_size, "dst_size": dst_size})
                    continue

            new_count += 1
            if len(new_files) < COMPARE_LIST_CAP:
                new_files.append({"path": rel, "size": src_size})

            if seen >= COMPARE_MAX_FILES or (time.time() - start) > COMPARE_MAX_SECONDS:
                truncated = True
                break
    except (OSError, PermissionError) as exc:
        return {
            "status": "failed",
            "error_message": str(exc)[:500],
        }

    return {
        "status": "complete",
        "new_count": new_count,
        "changed_count": changed_count,
        "unchanged_count": unchanged_count,
        "new_files": json.dumps(new_files),
        "changed_files": json.dumps(changed_files),
        "unchanged_files": json.dumps(unchanged_files),
        "truncated": truncated,
    }


def compare_pending_jobs(cfg: dict) -> None:
    try:
        data = get(cfg, "/agent/pending-compares", {"computer_name": cfg["computer_name"], "agent_id": cfg.get("agent_id", "")})
    except Exception as exc:  # noqa: BLE001
        log(f"compare: fetch failed: {exc}")
        return
    requests_ = data.get("compares", [])
    if not requests_:
        return
    for req in requests_:
        log(f"compare: scanning request_id={req['id']} {req['source_folder_path']} → {req['target_folder_path']}")
        result = compare_folders(Path(req["source_folder_path"]), Path(req["target_folder_path"]))
        result["id"] = req["id"]
        try:
            post(cfg, "/agent/compare-result", result)
            log(f"compare: id={req['id']} done — new={result.get('new_count', 0)} changed={result.get('changed_count', 0)} unchanged={result.get('unchanged_count', 0)}")
        except Exception as exc:  # noqa: BLE001
            log(f"compare: post failed for id={req['id']}: {exc}")


# ---------- Watch mode ----------

class WatchedJob(FileSystemEventHandler):
    """Per-job filesystem watcher with a debounce timer."""
    def __init__(self, job: dict, cfg: dict):
        self.job = job
        self.cfg = cfg
        self.timer: threading.Timer | None = None
        self.lock = threading.Lock()
        self.watch = None  # ObservedWatch handle from observer.schedule

    def start(self, observer: Observer) -> None:
        path = self.job["source_folder_path"]
        if not Path(path).exists():
            log(f"watch: source missing for {self.job['name']!r}: {path}")
            return
        try:
            self.watch = observer.schedule(self, path, recursive=True)
            log(f"watch: armed {self.job['name']!r} on {path}")
        except OSError as exc:
            log(f"watch: failed to arm {self.job['name']!r}: {exc}")

    def stop(self, observer: Observer) -> None:
        with self.lock:
            if self.timer:
                self.timer.cancel()
                self.timer = None
        if self.watch:
            try:
                observer.unschedule(self.watch)
            except KeyError:
                pass
            self.watch = None
        log(f"watch: disarmed {self.job['name']!r}")

    def update(self, job: dict) -> bool:
        """Return True if the source path changed (caller should restart the watcher)."""
        path_changed = job["source_folder_path"] != self.job["source_folder_path"]
        self.job = job
        return path_changed

    def on_created(self, event):
        if event.is_directory:
            return
        _bump_file_event()
        self._kick()

    def on_modified(self, event):
        if event.is_directory:
            return
        _bump_file_event()
        self._kick()

    def _kick(self) -> None:
        delay = int(self.job.get("watch_mode_delay_seconds", 30))
        with self.lock:
            if self.timer:
                self.timer.cancel()
            self.timer = threading.Timer(delay, self._fire)
            self.timer.daemon = True
            self.timer.start()

    def _fire(self) -> None:
        with self.lock:
            self.timer = None
        try:
            execute_sync(self.job, self.cfg, triggered_by="watch")
        except Exception as exc:  # noqa: BLE001
            log(f"watch: fire failed for {self.job['name']!r}: {exc}")


class WatchManager:
    """Reconciles a set of WatchedJob handlers against the latest job list from the Pi."""
    def __init__(self, cfg: dict):
        self.cfg = cfg
        self.observer = Observer()
        self.observer.start()
        self.handlers: dict[int, WatchedJob] = {}

    def reconcile(self, jobs: list[dict]) -> None:
        wanted = {j["id"]: j for j in jobs if j.get("watch_mode_enabled") and j.get("enabled", True)}

        # Stop watchers that are no longer wanted.
        for jid in list(self.handlers):
            if jid not in wanted:
                self.handlers.pop(jid).stop(self.observer)

        # Start/update watchers.
        for jid, job in wanted.items():
            existing = self.handlers.get(jid)
            if existing is None:
                wj = WatchedJob(job, self.cfg)
                wj.start(self.observer)
                self.handlers[jid] = wj
            else:
                if existing.update(job):
                    existing.stop(self.observer)
                    new = WatchedJob(job, self.cfg)
                    new.start(self.observer)
                    self.handlers[jid] = new

    def stop(self) -> None:
        for h in list(self.handlers.values()):
            h.stop(self.observer)
        self.observer.stop()
        self.observer.join(timeout=2)


# ---------- Poll loop ----------

def poll_pending(cfg: dict) -> None:
    data = get(cfg, "/agent/pending-syncs", {"computer_name": cfg["computer_name"], "agent_id": cfg.get("agent_id", "")})
    pending = data.get("pending", [])
    if not pending:
        return
    log(f"found {len(pending)} pending job(s)")
    for entry in pending:
        execute_sync(entry["job"], cfg, log_id=entry["log_id"], triggered_by=entry.get("triggered_by", "manual"))


_initial_job_sent = False


def fetch_config(cfg: dict) -> list[dict]:
    """Fetch jobs + settings from the Pi. Settings are applied to cfg in-place;
    each loop reads its interval from cfg on every iteration so changes take
    effect on the next sleep cycle (no restart). Also seeds the first sync job
    once, when the wizard captured source/target folders and the PC has just
    been approved with no jobs yet."""
    global _initial_job_sent
    data = get(cfg, "/agent/config", {"computer_name": cfg["computer_name"], "agent_id": cfg.get("agent_id", "")})
    # Learn renames + canonical agent_id from any approved/pending response.
    if _absorb_identity(cfg, data) and cfg.get("_config_path"):
        save_config(cfg["_config_path"], cfg)
    if data.get("status") != "approved":
        return []
    settings = data.get("settings") or {}
    for key in ("metrics_interval_seconds", "heartbeat_interval_seconds", "poll_interval_seconds"):
        if key in settings and settings[key] is not None:
            new_val = int(settings[key])
            if cfg.get(key) != new_val:
                log(f"settings: {key} {cfg.get(key)} → {new_val} (pushed by Pi)")
                cfg[key] = new_val
    # String settings — pushed even when empty so a cleared list re-arms to "".
    if "watch_processes" in settings:
        new_val = settings["watch_processes"] or ""
        if cfg.get("watch_processes") != new_val:
            log(f"settings: watch_processes {cfg.get('watch_processes')!r} → {new_val!r} (pushed by Pi)")
            cfg["watch_processes"] = new_val
    # Auto-update source path. Pi sends the resolved path (per-PC override
    # falling back to lab-wide central_build_path). Empty string from Pi means
    # "no central path set" — keep whatever's in our local agent.json.
    if "update_source_path" in settings:
        new_val = (settings["update_source_path"] or "").strip()
        if new_val and cfg.get("update_source_path") != new_val:
            log(f"settings: update_source_path {cfg.get('update_source_path')!r} → {new_val!r} (pushed by Pi)")
            cfg["update_source_path"] = new_val
    # Admin "Push update" — fires once when this timestamp jumps forward.
    req = settings.get("update_requested_at")
    if req and req != cfg.get("_last_update_request_seen"):
        cfg["_last_update_request_seen"] = req
        log(f"update: dashboard requested check at {req}")
        try:
            new = check_for_update(cfg)
            if new:
                log(f"update: applying {new}")
                apply_update(new)  # exits the process
            else:
                log("update: nothing newer on share")
        except Exception as exc:  # noqa: BLE001
            log(f"update: dashboard-triggered check failed: {exc}")
    jobs = data.get("jobs", [])

    # First-run seeding: if the wizard captured source/target and the Pi has no
    # jobs for us yet, ask the Pi to create one. Idempotent server-side.
    if (not _initial_job_sent and not jobs
            and cfg.get("source_folder") and cfg.get("target_folder")):
        try:
            r = post(cfg, "/agent/initial-job", {
                "computer_name": cfg["computer_name"],
                "agent_id": cfg.get("agent_id"),
                "source_folder_path": cfg["source_folder"],
                "target_folder_path": cfg["target_folder"],
            })
            if r.get("created"):
                log(f"initial sync job created for {cfg['source_folder']} → {cfg['target_folder']}")
            jobs = r.get("jobs", jobs)
        except Exception as exc:  # noqa: BLE001
            log(f"initial-job request failed: {exc}")
        finally:
            _initial_job_sent = True

    return jobs


def poll_loop(cfg: dict, watch_mgr: WatchManager, state=None) -> None:
    last_jobs_signature = None
    while True:
        try:
            if state:
                state.set(syncing=False)
            poll_pending(cfg)
        except Exception as exc:  # noqa: BLE001
            log(f"poll failed: {exc}")
        try:
            analyze_pending_jobs(cfg)
        except Exception as exc:  # noqa: BLE001
            log(f"analyze loop failed: {exc}")
        try:
            compare_pending_jobs(cfg)
        except Exception as exc:  # noqa: BLE001
            log(f"compare loop failed: {exc}")
        try:
            jobs = fetch_config(cfg)
            sig = tuple(sorted((j["id"], j.get("watch_mode_enabled"), j.get("source_folder_path")) for j in jobs))
            if sig != last_jobs_signature:
                watch_mgr.reconcile(jobs)
                last_jobs_signature = sig
        except Exception as exc:  # noqa: BLE001
            log(f"config fetch failed: {exc}")
        time.sleep(cfg["poll_interval_seconds"])


# ---------- main ----------

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    ap.add_argument("--no-tray", action="store_true", help="Run in foreground console mode (dev).")
    ap.add_argument("--setup", action="store_true", help="Force the setup wizard even if a config exists.")
    args = ap.parse_args()

    has_console = args.no_tray or not getattr(sys, "frozen", False)
    log_path = setup_logging(verbose=has_console)

    cfg = load_config(args.config)
    if cfg is None or args.setup:
        log("config missing/invalid → launching setup wizard")
        try:
            import config_ui  # type: ignore  # local module
        except ImportError as exc:
            sys.exit(f"setup wizard unavailable ({exc}); please create {args.config} manually.")
        new_cfg = config_ui.show_wizard(cfg or {})
        if not new_cfg:
            log("setup cancelled")
            return 0
        config_ui.write_config(args.config, new_cfg)
        log(f"saved config → {args.config}")
        cfg = load_config(args.config)
        if cfg is None:
            sys.exit("config still invalid after wizard — aborting")

    # Stash so heartbeat / poll loops can persist server-side renames + agent_id.
    cfg["_config_path"] = args.config
    # Save now if load_config minted a new agent_id for a legacy config.
    save_config(args.config, cfg)

    log(f"DataBased agent v{AGENT_VERSION}")
    # Probe alternates at startup so we land on the right URL before the
    # first heartbeat fires — useful when moving the Pi between networks.
    if cfg.get("pi_url_alt"):
        winner = find_reachable_pi(cfg)
        if winner and winner != cfg["pi_url"]:
            log(f"pi_url startup probe: switching {cfg['pi_url']} → {winner}")
            alts = [u for u in _candidate_pi_urls(cfg) if u != winner]
            cfg["pi_url"] = winner
            cfg["pi_url_alt"] = alts
    log(f"Pi: {cfg['pi_url']}" + (f"  (alts: {', '.join(cfg.get('pi_url_alt') or [])})" if cfg.get("pi_url_alt") else ""))
    log(f"This machine: {cfg['computer_name']} ({cfg['icon_type']})")
    log(f"Log file: {log_path}")

    # Auto-update startup check — if NAS has a newer exe, swap + relaunch now
    # (this call exits the process if it succeeds).
    try:
        new = check_for_update(cfg)
        if new:
            log(f"update: newer exe found at {new} — swapping")
            apply_update(new)
    except Exception as exc:  # noqa: BLE001
        log(f"update startup check failed: {exc}")

    if args.no_tray:
        return _run_foreground(cfg)
    return _run_with_tray(cfg, log_path)


def _run_foreground(cfg: dict) -> int:
    watch_mgr = WatchManager(cfg)
    threading.Thread(target=heartbeat_loop, args=(cfg,), daemon=True).start()
    threading.Thread(target=metrics_loop, args=(cfg,), daemon=True).start()
    threading.Thread(target=update_loop, args=(cfg,), daemon=True).start()
    try:
        poll_loop(cfg, watch_mgr)
    except KeyboardInterrupt:
        log("shutting down")
    finally:
        watch_mgr.stop()
    return 0


def _run_with_tray(cfg: dict, log_path: Path) -> int:
    from tray import AgentState, run_tray  # type: ignore

    state = AgentState()
    watch_mgr = WatchManager(cfg)
    threading.Thread(target=heartbeat_loop, args=(cfg, state), daemon=True).start()
    threading.Thread(target=metrics_loop, args=(cfg,), daemon=True).start()
    threading.Thread(target=poll_loop, args=(cfg, watch_mgr, state), daemon=True).start()
    threading.Thread(target=update_loop, args=(cfg,), daemon=True).start()

    config_path = Path(sys.argv[sys.argv.index("--config") + 1]) if "--config" in sys.argv else DEFAULT_CONFIG

    quit_event = threading.Event()

    def on_quit():
        log("quit from tray")
        quit_event.set()

    def on_check_update():
        """Tray menu callback — runs the same path as the periodic update_loop."""
        log("manual update check from tray")
        try:
            new = check_for_update(cfg)
            if new:
                log(f"update: newer build at {new} — applying")
                apply_update(new)  # exits the process; bat handles relaunch
            else:
                log("update: nothing newer on share")
        except Exception as exc:  # noqa: BLE001
            log(f"update: manual check failed: {exc}")

    def on_open_internet():
        """Tray menu callback — launch a Chromium browser through the Pi proxy."""
        ok, msg = open_internet_tunnel(cfg)
        log(f"tunnel: {msg}")

    try:
        run_tray(state, cfg, log_path, on_quit,
                 config_path=config_path, on_check_update=on_check_update,
                 on_open_internet=on_open_internet)
    finally:
        watch_mgr.stop()
    return 0


if __name__ == "__main__":
    sys.exit(main())
