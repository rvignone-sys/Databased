"""Background maintenance: prune stale pending sync logs, age out old logs.

Runs as a side-job on the same APScheduler that fires cron-driven syncs.
"""
import threading
from datetime import timedelta

from .models import SyncLog, db, utcnow


# Tunables. Both can be overridden later via LabSettings if you want.
STALE_PENDING_MINUTES = 30   # pending logs older than this with no agent → drop
RETENTION_DAYS = 60          # delete completed logs older than this


_app = None
_lock = threading.Lock()


def _prune_once() -> None:
    if _app is None:
        return
    with _app.app_context():
        # SQLite stores datetimes naively; the SQLAlchemy in-Python evaluator
        # used by bulk-DELETE will throw on naive vs. tz-aware comparison.
        # Strip tz from cutoff values for both queries.
        now = utcnow()
        stale_cutoff = (now - timedelta(minutes=STALE_PENDING_MINUTES)).replace(tzinfo=None)
        retention_cutoff = (now - timedelta(days=RETENTION_DAYS)).replace(tzinfo=None)
        completed_naive = now.replace(tzinfo=None)

        # Stale pending: cron fired but agent never picked it up (offline).
        stale = db.session.execute(
            db.select(SyncLog).where(
                SyncLog.status.in_(("pending", "running")),
                SyncLog.started_at < stale_cutoff,
            )
        ).scalars().all()
        for s in stale:
            s.status = "failed"
            s.error_message = "agent did not pick up the job within 30 minutes (likely offline)"
            s.completed_at = completed_naive

        # Retention: delete finished log rows older than RETENTION_DAYS.
        # synchronize_session=False skips the in-Python eval that would fail.
        deleted = db.session.execute(
            db.delete(SyncLog).where(SyncLog.started_at < retention_cutoff),
            execution_options={"synchronize_session": False},
        )

        if stale or (deleted.rowcount or 0) > 0:
            db.session.commit()
            print(
                f"[maintenance] pruned {len(stale)} stale, "
                f"deleted {deleted.rowcount or 0} old log(s)",
                flush=True,
            )


def start(app, scheduler) -> None:
    """Schedule the prune job on the existing APScheduler. Idempotent."""
    global _app
    with _lock:
        _app = app
        if scheduler.get_job("__maintenance__"):
            return
        scheduler.add_job(
            _prune_once,
            trigger="interval",
            minutes=10,
            id="__maintenance__",
            name="log-maintenance",
            coalesce=True,
            max_instances=1,
        )
        # Run once immediately so a fresh boot cleans up promptly.
        _prune_once()
        print("[maintenance] scheduled (every 10 min)", flush=True)
