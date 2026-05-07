"""Pi-side metrics. Same shape as the agent's payload so the dashboard's
Resources component can render it without special-casing.
"""
import math
import threading
import time
from collections import deque
from datetime import datetime, timezone

import psutil


MAX_SAMPLES = 60


class _HostCollector:
    def __init__(self):
        self._last_net = psutil.net_io_counters()
        self._last_disk = psutil.disk_io_counters() if hasattr(psutil, "disk_io_counters") else None
        self._last_at = time.time()
        psutil.cpu_percent(interval=None, percpu=True)
        psutil.cpu_percent(interval=None)

    def collect(self) -> dict:
        now = time.time()
        elapsed = max(0.001, now - self._last_at)

        per_core = psutil.cpu_percent(interval=None, percpu=True)
        overall = psutil.cpu_percent(interval=None)
        try:
            freq = psutil.cpu_freq()
            freq_mhz = round(freq.current, 0) if freq else None
        except (NotImplementedError, OSError):
            freq_mhz = None

        vm = psutil.virtual_memory()

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

        net = psutil.net_io_counters()
        sent_kbps = max(0, (net.bytes_sent - self._last_net.bytes_sent) * 8 / 1024 / elapsed)
        recv_kbps = max(0, (net.bytes_recv - self._last_net.bytes_recv) * 8 / 1024 / elapsed)
        self._last_net = net

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
            "processes": len(psutil.pids()),
            "threads": None,
            "handles": None,
            "uptime_seconds": int(time.time() - psutil.boot_time()),
        }


class HostMetrics:
    def __init__(self, interval_seconds: int = 5):
        self._interval = interval_seconds
        self._buffer: deque[dict] = deque(maxlen=MAX_SAMPLES)
        self._lock = threading.Lock()
        self._thread: threading.Thread | None = None

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._thread = threading.Thread(target=self._loop, daemon=True, name="HostMetrics")
        self._thread.start()

    def _loop(self) -> None:
        collector = _HostCollector()
        while True:
            try:
                sample = collector.collect()
                with self._lock:
                    self._buffer.append(sample)
            except Exception as exc:  # noqa: BLE001
                print(f"[host_metrics] collect failed: {exc}", flush=True)
            time.sleep(self._interval)

    def latest(self) -> dict | None:
        with self._lock:
            return self._buffer[-1] if self._buffer else None

    def history(self) -> list[dict]:
        with self._lock:
            return list(self._buffer)


host = HostMetrics(interval_seconds=5)
