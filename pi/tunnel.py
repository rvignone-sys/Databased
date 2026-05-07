"""Internet-tunnel control. Reads which approved Computers have
`internet_enabled=True`, and shells out to the privileged helper
(/usr/local/bin/databased-tunnel) to keep tinyproxy's ACL in sync.

The Flask process never touches /etc/ or systemctl directly — sudoers
gives it NOPASSWD access only to the helper script.
"""
from __future__ import annotations

import subprocess
import threading

from datetime import timedelta, timezone

from .models import Computer, db, utcnow
from .metrics_store import store as metrics_store


HELPER = "/usr/local/bin/databased-tunnel"
_lock = threading.Lock()

# Auto-off threshold: if a tunnel-enabled PC has been idle (no user input AND
# no file activity) for this long, the watchdog disables its tunnel. The
# enable timestamp acts as a grace period — we never auto-off within this
# window of being turned on, even if the PC is currently idle.
IDLE_AUTO_OFF_SECONDS = 30 * 60


def _check_watchdog_auto_off(app) -> int:
    """Walk PCs with internet_enabled=True; disable any whose user has been
    idle longer than IDLE_AUTO_OFF_SECONDS (and were enabled long enough ago
    that the grace period has elapsed). Returns count disabled."""
    disabled = 0
    with app.app_context():
        rows = db.session.execute(
            db.select(Computer).where(
                Computer.status == "approved",
                Computer.internet_enabled == True,  # noqa: E712
            )
        ).scalars().all()
        now = utcnow().replace(tzinfo=None)
        for c in rows:
            # Grace period — don't auto-off something just toggled on.
            anchor = c.internet_enabled_at
            if anchor is not None:
                if anchor.tzinfo is not None:
                    anchor = anchor.replace(tzinfo=None)
                age = (now - anchor).total_seconds()
                if age < IDLE_AUTO_OFF_SECONDS:
                    continue

            sample = metrics_store.latest(c.id)
            if not sample:
                # No metrics yet — leave it alone.
                continue
            idle = sample.get("idle_seconds")
            file_ago = sample.get("last_file_event_seconds")
            user_idle = (idle is None) or (idle >= IDLE_AUTO_OFF_SECONDS)
            file_idle = (file_ago is None) or (file_ago >= IDLE_AUTO_OFF_SECONDS)
            if user_idle and file_idle:
                c.internet_enabled = False
                c.internet_enabled_at = None
                disabled += 1
                print(f"[tunnel] auto-off {c.name}: idle {idle}s, last file {file_ago}s", flush=True)
        if disabled:
            db.session.commit()
    return disabled


def _approved_internet_ips(app) -> list[str]:
    with app.app_context():
        rows = db.session.execute(
            db.select(Computer.ip_address).where(
                Computer.status == "approved",
                Computer.internet_enabled == True,  # noqa: E712 (SQLAlchemy boolean)
                Computer.ip_address.isnot(None),
            )
        ).all()
    return sorted({(r[0] or "").strip() for r in rows if (r[0] or "").strip()})


def sync(app) -> dict:
    """Reconcile tinyproxy state with the DB. Returns a status dict."""
    ips = _approved_internet_ips(app)
    with _lock:
        if not ips:
            # No PC enabled — stop the tunnel entirely.
            try:
                subprocess.run(["sudo", HELPER, "stop"], check=False,
                               capture_output=True, text=True, timeout=10)
                return {"running": False, "ips": [], "reason": "no PCs enabled"}
            except (OSError, subprocess.TimeoutExpired) as exc:
                return {"running": False, "ips": [], "error": str(exc)}
        try:
            r = subprocess.run(["sudo", HELPER, "apply", *ips], check=False,
                               capture_output=True, text=True, timeout=15)
            return {
                "running": r.returncode == 0,
                "ips": ips,
                "stderr": r.stderr.strip() if r.stderr else None,
            }
        except (OSError, subprocess.TimeoutExpired) as exc:
            return {"running": False, "ips": ips, "error": str(exc)}


def status() -> dict:
    """Read live tinyproxy state via the helper. Doesn't mutate anything."""
    try:
        r = subprocess.run(["sudo", HELPER, "status"], check=False,
                           capture_output=True, text=True, timeout=5)
        out = (r.stdout or "").strip().splitlines()
        running = bool(out and out[0].strip() == "running")
        # Helper indents allow lines with two spaces — extract just the IP.
        allowed = []
        for line in out[1:]:
            line = line.strip()
            if line.startswith("Allow "):
                allowed.append(line.removeprefix("Allow ").strip())
        return {"running": running, "ips": allowed}
    except (OSError, subprocess.TimeoutExpired) as exc:
        return {"running": False, "ips": [], "error": str(exc)}


# ----- Periodic auto-sync -----
_app = None


def _periodic_sync() -> None:
    if _app is None:
        return
    try:
        # First, let the watchdog turn off anything idle-too-long. Then
        # reconcile tinyproxy with whatever's still enabled.
        _check_watchdog_auto_off(_app)
        sync(_app)
    except Exception as exc:  # noqa: BLE001
        print(f"[tunnel] periodic sync failed: {exc}", flush=True)


def start(app, scheduler) -> None:
    """Schedule periodic ACL sync on the existing APScheduler. Idempotent."""
    global _app
    _app = app
    if scheduler.get_job("__tunnel_sync__"):
        return
    scheduler.add_job(
        _periodic_sync,
        trigger="interval",
        minutes=5,
        id="__tunnel_sync__",
        name="tunnel-sync",
        coalesce=True,
        max_instances=1,
    )
    # Also run immediately so a freshly-started Pi reconciles state quickly.
    _periodic_sync()
    print("[tunnel] scheduled (every 5 min)", flush=True)
