"""APScheduler glue. Reads jobs from the DB, schedules cron-style fires,
and creates pending SyncLog entries for the agent to pick up.

Reconciles the schedule on every tick (cheap) so dashboard edits propagate
without a Pi restart.
"""
import threading
from typing import Optional

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from .models import SyncJob, SyncLog, db, utcnow


_scheduler: Optional[BackgroundScheduler] = None
_app = None
_lock = threading.Lock()
# Cache of cron strings per ap_id so reconcile only reschedules on real changes.
# Without this, calling reschedule() unconditionally every 60s shifts the next-fire
# time and APScheduler ends up firing twice per minute boundary.
_known_crons: dict[str, str] = {}


def _enqueue_sync(job_id: int) -> None:
    """Insert a pending SyncLog so the agent's next poll picks it up."""
    if _app is None:
        return
    with _app.app_context():
        job = db.session.get(SyncJob, job_id)
        if not job or not job.enabled:
            return
        log = SyncLog(
            job_id=job.id,
            computer_id=job.source_computer_id,
            triggered_by="schedule",
            started_at=utcnow(),
            status="pending",
        )
        db.session.add(log)
        db.session.commit()
        print(f"[scheduler] queued job_id={job.id} ({job.name})", flush=True)


def _reconcile() -> None:
    """Walk all jobs, sync the scheduler's view against the DB."""
    if _scheduler is None or _app is None:
        return
    with _app.app_context():
        rows = db.session.execute(db.select(SyncJob)).scalars().all()
        wanted: dict[str, SyncJob] = {}
        for j in rows:
            if j.enabled and j.schedule_cron:
                wanted[f"job-{j.id}"] = j

        # Drop apscheduler entries that are no longer wanted.
        for ap_job in _scheduler.get_jobs():
            if ap_job.id.startswith("job-") and ap_job.id not in wanted:
                _scheduler.remove_job(ap_job.id)
                _known_crons.pop(ap_job.id, None)

        # Add or update wanted jobs. Only call reschedule when the cron actually
        # changed — calling it on every reconcile shifts the next-fire time and
        # produces duplicate fires.
        for ap_id, job in wanted.items():
            try:
                trigger = CronTrigger.from_crontab(job.schedule_cron)
            except ValueError as exc:
                print(f"[scheduler] bad cron {job.schedule_cron!r} on job {job.id}: {exc}", flush=True)
                continue
            existing = _scheduler.get_job(ap_id)
            if existing is None:
                _scheduler.add_job(
                    _enqueue_sync, trigger=trigger, args=[job.id],
                    id=ap_id, name=job.name, replace_existing=True,
                    misfire_grace_time=300, coalesce=True, max_instances=1,
                )
                _known_crons[ap_id] = job.schedule_cron
            elif _known_crons.get(ap_id) != job.schedule_cron:
                existing.reschedule(trigger=trigger)
                _known_crons[ap_id] = job.schedule_cron


def start(app) -> None:
    """Start the background scheduler. Idempotent."""
    global _scheduler, _app
    with _lock:
        if _scheduler is not None:
            return
        _app = app
        _scheduler = BackgroundScheduler(daemon=True)
        # Tick once a minute to pick up dashboard edits without restart.
        _scheduler.add_job(_reconcile, trigger="interval", seconds=60, id="__reconcile__")
        _scheduler.start()
        _reconcile()
        # Hook log-maintenance onto the same scheduler.
        from . import maintenance
        maintenance.start(app, _scheduler)
        # Alert evaluator (offline / storage-high) on the same loop.
        from . import alerts
        alerts.start(app, _scheduler)
        # Internet tunnel ACL sync — keeps tinyproxy's allow list aligned
        # with which approved Computers have internet_enabled=True.
        from . import tunnel
        tunnel.start(app, _scheduler)
        print("[scheduler] started", flush=True)


def shutdown() -> None:
    global _scheduler
    with _lock:
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
            _scheduler = None
