"""In-memory rolling metrics store. Not persisted; resets on Pi restart.
Keeps the last N samples per computer for sparkline rendering.
"""
import threading
from collections import deque
from typing import Optional

MAX_SAMPLES = 60  # 5 min at 5s interval — enough for a sparkline


class MetricsStore:
    def __init__(self):
        self._buffers: dict[int, deque] = {}
        self._lock = threading.Lock()

    def push(self, computer_id: int, sample: dict) -> None:
        with self._lock:
            buf = self._buffers.get(computer_id)
            if buf is None:
                buf = deque(maxlen=MAX_SAMPLES)
                self._buffers[computer_id] = buf
            buf.append(sample)

    def latest(self, computer_id: int) -> Optional[dict]:
        with self._lock:
            buf = self._buffers.get(computer_id)
            return buf[-1] if buf else None

    def history(self, computer_id: int) -> list[dict]:
        with self._lock:
            buf = self._buffers.get(computer_id)
            return list(buf) if buf else []


store = MetricsStore()
