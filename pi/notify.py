"""Outgoing webhook notifier. POSTs Slack-compatible JSON to whatever URL the
operator configured in Settings (Lab Buddy, raw Slack, Mattermost, etc.).

Stays dumb on purpose — title/body shaping happens here, but routing/templating
belongs to the receiver. Dedup is in-memory keyed by the caller-supplied
`dedup_key` so we don't spam during a flap (Pi restart resets it).
"""
from __future__ import annotations

import threading
import time
from typing import Optional

import requests

from .models import db, get_settings


# dedup_key -> last-fired epoch seconds. Trimmed lazily.
_recent: dict[str, float] = {}
_recent_lock = threading.Lock()
DEDUP_WINDOW_SECONDS = 30 * 60   # don't repeat the same alert within 30 min
HTTP_TIMEOUT = 5


_LEVEL_PREFIX = {
    "info":  ":information_source:",
    "warn":  ":warning:",
    "error": ":rotating_light:",
    "ok":    ":white_check_mark:",
}


def _should_send(dedup_key: Optional[str]) -> bool:
    if not dedup_key:
        return True
    now = time.time()
    with _recent_lock:
        # Lazy GC: drop anything older than the window
        for k in [k for k, t in _recent.items() if now - t > DEDUP_WINDOW_SECONDS]:
            _recent.pop(k, None)
        last = _recent.get(dedup_key)
        if last and (now - last) < DEDUP_WINDOW_SECONDS:
            return False
        _recent[dedup_key] = now
        return True


def clear_dedup(dedup_key: str) -> None:
    """Forget the dedup record so the next call to notify() with this key fires
    immediately. Use when a recovered condition should re-arm an alert."""
    with _recent_lock:
        _recent.pop(dedup_key, None)


def notify(
    level: str,
    title: str,
    body: str = "",
    *,
    dedup_key: Optional[str] = None,
    force: bool = False,
) -> bool:
    """Send a notification. Returns True if posted, False if suppressed/disabled.

    `force=True` bypasses dedup (used by the Test button)."""
    s = get_settings()
    url = (s.slack_webhook_url or "").strip()
    if not url:
        return False
    if not force and not _should_send(dedup_key):
        return False

    prefix = _LEVEL_PREFIX.get(level, "")
    text = f"{prefix} *{title}*"
    if body:
        text += f"\n{body}"

    payload = {
        "text": text,
        # Lab Buddy / structured consumers can read these instead of parsing text.
        "databased": {
            "level": level,
            "title": title,
            "body": body,
            "lab_name": s.lab_name or "DataBased",
        },
    }
    try:
        r = requests.post(url, json=payload, timeout=HTTP_TIMEOUT)
        if r.status_code >= 300:
            print(f"[notify] webhook returned {r.status_code}: {r.text[:200]}", flush=True)
            return False
        return True
    except requests.RequestException as exc:
        print(f"[notify] webhook POST failed: {exc}", flush=True)
        return False


def test_notify() -> tuple[bool, str]:
    """Fire a test message. Returns (ok, reason)."""
    s = get_settings()
    if not (s.slack_webhook_url or "").strip():
        return False, "no webhook URL configured"
    ok = notify(
        "info",
        "DataBased test ping",
        f"Webhook reachable. Lab: {s.lab_name or 'DataBased'}",
        force=True,
    )
    return ok, "delivered" if ok else "POST failed (see Pi logs)"
