"""Sync job CRUD + manual trigger (trigger is a stub until the agent exists)."""
from flask import Blueprint, jsonify, request
from flask_login import login_required

from ..models import Computer, SyncJob, SyncLog, JobCompare, db, utcnow
from ..auth import admin_required


bp = Blueprint("jobs", __name__, url_prefix="/api/jobs")


VALID_DIRECTIONS = {
    "one-way",        # additive: copy new + updated, never delete from target  (default)
    "mirror",         # one-way + delete files from target when removed from source
    "move",           # copy then delete from source (relocation)
    "bidirectional",  # reserved — agent doesn't implement yet
}
VALID_CONFLICT = {"skip", "skip-if-same-size", "version-number", "timestamp-suffix"}


def _payload_to_kwargs(data: dict) -> dict:
    kwargs = {}
    for field in (
        "name",
        "source_computer_id",
        "source_folder_path",
        "target_folder_path",
        "sync_direction",
        "conflict_handling",
        "enabled",
        "schedule_cron",
        "watch_mode_enabled",
        "watch_mode_delay_seconds",
        "exclude_patterns",
    ):
        if field in data:
            kwargs[field] = data[field]
    return kwargs


@bp.get("")
@login_required
def list_jobs():
    rows = db.session.execute(db.select(SyncJob).order_by(SyncJob.created_at.desc())).scalars().all()
    return jsonify([j.to_dict() for j in rows])


@bp.post("")
@admin_required
def create_job():
    data = request.get_json(silent=True) or {}
    required = ("name", "source_computer_id", "source_folder_path", "target_folder_path")
    if not all(data.get(f) for f in required):
        return jsonify({"error": f"required: {required}"}), 400

    if data.get("sync_direction") and data["sync_direction"] not in VALID_DIRECTIONS:
        return jsonify({"error": "invalid sync_direction"}), 400
    if data.get("conflict_handling") and data["conflict_handling"] not in VALID_CONFLICT:
        return jsonify({"error": "invalid conflict_handling"}), 400

    if not db.session.get(Computer, data["source_computer_id"]):
        return jsonify({"error": "source_computer_id not found"}), 400

    kwargs = _payload_to_kwargs(data)
    # Safety: every new sync job starts disabled and queues a pre-sync analysis.
    # The dashboard's Pending Review panel surfaces it; admin enables after seeing
    # the file count + total size.
    kwargs["enabled"] = False
    kwargs["analyze_status"] = "pending"
    job = SyncJob(**kwargs)
    db.session.add(job)
    db.session.commit()
    return jsonify(job.to_dict()), 201


@bp.put("/<int:job_id>")
@admin_required
def update_job(job_id: int):
    job = db.session.get(SyncJob, job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    for k, v in _payload_to_kwargs(request.get_json(silent=True) or {}).items():
        setattr(job, k, v)
    db.session.commit()
    return jsonify(job.to_dict())


@bp.delete("/<int:job_id>")
@admin_required
def delete_job(job_id: int):
    job = db.session.get(SyncJob, job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    db.session.delete(job)
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/<int:job_id>/compare")
@login_required
def request_compare(job_id: int):
    """Queue a source-vs-target comparison. Agent picks it up on next poll
    and posts results back. Frontend polls /api/compares/<id> for completion."""
    job = db.session.get(SyncJob, job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    cmp = JobCompare(job_id=job.id, status="pending")
    db.session.add(cmp)
    db.session.commit()
    return jsonify(cmp.to_dict()), 202


@bp.get("/compares/<int:compare_id>")
@login_required
def get_compare(compare_id: int):
    """Frontend poll for comparison status / results."""
    cmp = db.session.get(JobCompare, compare_id)
    if not cmp:
        return jsonify({"error": "not found"}), 404
    return jsonify(cmp.to_dict())


@bp.post("/<int:job_id>/trigger")
@admin_required
def trigger_job(job_id: int):
    """Stub: enqueue a manual run. Real impl will push to the agent in a follow-up."""
    job = db.session.get(SyncJob, job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    log = SyncLog(
        job_id=job.id,
        computer_id=job.source_computer_id,
        triggered_by="manual",
        started_at=utcnow(),
        status="pending",
    )
    db.session.add(log)
    db.session.commit()
    return jsonify({"ok": True, "log_id": log.id}), 202
