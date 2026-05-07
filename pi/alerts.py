"""Alert evaluator. Two paths:

1. Immediate: `on_sync_log_finished(log)` is called from the agent log endpoint
   the moment a SyncLog flips to a terminal status. Fires a job-failed alert
   when relevant.
2. Periodic: `_evaluate_periodic()` runs every few minutes via the same
   APScheduler that drives cron + maintenance. Catches conditions that aren't
   triggered by a single event — agents going silent, disks crossing the high-
   water mark.

Dedup state lives in `notify._recent` so the same alert doesn't repeat.
"""
from __future__ import annotations

import threading
from datetime import timedelta

from . import notify as notifier
from .models import Computer, SyncJob, SyncLog, db, get_settings, utcnow
from .metrics_store import store as metrics_store


OFFLINE_ALERT_AFTER_MINUTES = 60  # alert if no heartbeat for this long
DEFAULT_STORAGE_PCT = 90          # fallback if pause_at_storage_pct unset

_app = None
_lock = threading.Lock()


# ----- Immediate hooks (called from API handlers) -----

def on_sync_log_finished(log: SyncLog) -> None:
    """Called from /agent/log when a SyncLog reaches a terminal status."""
    if log is None:
        return
    s = get_settings()
    status = (log.status or "").lower()
    job = db.session.get(SyncJob, log.job_id) if log.job_id else None
    comp = db.session.get(Computer, log.computer_id) if log.computer_id else None
    job_name = job.name if job else f"job #{log.job_id}"
    comp_name = comp.name if comp else f"computer #{log.computer_id}"

    if status == "failed" and s.slack_notify_failure:
        body = (
            f"Instrument: {comp_name}\n"
            f"Files copied: {log.files_copied or 0} · failed: {log.files_failed or 0}\n"
            f"{(log.error_message or '').strip()[:500]}"
        )
        notifier.notify(
            "error",
            f"Sync failed — {job_name}",
            body,
            dedup_key=f"job-failed-{log.job_id}",
        )
    elif status == "success" and s.slack_notify_success:
        # Re-arm a previously alerted failure so the next failure fires fresh.
        notifier.clear_dedup(f"job-failed-{log.job_id}")
        if (log.triggered_by or "") == "manual" and not s.slack_notify_manual:
            return
        body = (
            f"Instrument: {comp_name}\n"
            f"Files copied: {log.files_copied or 0} · skipped: {log.files_skipped or 0}"
        )
        notifier.notify("ok", f"Sync ok — {job_name}", body)


# ----- Periodic evaluator -----

def _evaluate_periodic() -> None:
    if _app is None:
        return
    with _app.app_context():
        _check_offline_agents()
        _check_storage_high()


def _check_offline_agents() -> None:
    cutoff = utcnow().replace(tzinfo=None) - timedelta(minutes=OFFLINE_ALERT_AFTER_MINUTES)
    rows = db.session.execute(
        db.select(Computer).where(Computer.status == "approved")
    ).scalars().all()
    for c in rows:
        if not c.last_heartbeat:
            continue
        offline = c.last_heartbeat < cutoff
        key = f"agent-offline-{c.id}"
        if offline:
            notifier.notify(
                "warn",
                f"Agent offline — {c.name}",
                f"No heartbeat for {OFFLINE_ALERT_AFTER_MINUTES}+ minutes.",
                dedup_key=key,
            )
        else:
            # Came back: drop the dedup so a future outage alerts again immediately.
            notifier.clear_dedup(key)


def _check_storage_high() -> None:
    s = get_settings()
    threshold = s.pause_at_storage_pct or DEFAULT_STORAGE_PCT
    if threshold <= 0:
        return  # operator disabled
    rows = db.session.execute(
        db.select(Computer).where(Computer.status == "approved")
    ).scalars().all()
    for c in rows:
        sample = metrics_store.latest(c.id)
        if not sample:
            continue
        disks = sample.get("disks") or []
        # Pick the worst-utilized mount on this PC.
        worst = None
        for d in disks:
            pct = d.get("percent")
            if pct is None:
                continue
            if worst is None or pct > worst.get("percent", 0):
                worst = d
        if not worst:
            continue
        key = f"storage-high-{c.id}-{worst.get('mount', '?')}"
        if worst["percent"] >= threshold:
            notifier.notify(
                "warn",
                f"Storage high — {c.name}",
                f"{worst.get('mount', '?')} at {worst['percent']:.0f}% "
                f"({worst.get('used_gb', 0):.0f} / {worst.get('total_gb', 0):.0f} GB) "
                f"— threshold {threshold}%.",
                dedup_key=key,
            )
        else:
            notifier.clear_dedup(key)


def start(app, scheduler) -> None:
    """Schedule the periodic evaluator on the existing APScheduler. Idempotent."""
    global _app
    with _lock:
        _app = app
        if scheduler.get_job("__alerts__"):
            return
        scheduler.add_job(
            _evaluate_periodic,
            trigger="interval",
            minutes=5,
            id="__alerts__",
            name="alert-evaluator",
            coalesce=True,
            max_instances=1,
        )
        print("[alerts] scheduled (every 5 min)", flush=True)
