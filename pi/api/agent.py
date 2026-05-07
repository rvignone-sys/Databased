"""Agent endpoints — no auth (closed network). Auto-creates pending Computer rows."""
from datetime import datetime
from flask import Blueprint, jsonify, request

from ..models import Computer, SyncJob, SyncLog, JobCompare, db, utcnow
from ..metrics_store import store as metrics_store
from .. import alerts


bp = Blueprint("agent", __name__, url_prefix="/agent")


@bp.post("/heartbeat")
def heartbeat():
    """First heartbeat from a new machine creates a pending Computer.
    Subsequent heartbeats update health fields.
    """
    data = request.get_json(silent=True) or {}
    name = (data.get("computer_name") or "").strip()
    if not name:
        return jsonify({"error": "computer_name required"}), 400

    c = db.session.execute(
        db.select(Computer).where(Computer.name == name)
    ).scalar_one_or_none()

    if not c:
        c = Computer(
            name=name,
            ip_address=data.get("ip_address") or request.remote_addr,
            status="pending",
            # New PCs come in as a generic "computer" — admin reclassifies via
            # the gear modal if it's actually an instrument. Wizard can override.
            icon_type=(data.get("icon_type") or "computer").lower(),
            agent_version=data.get("agent_version"),
            # Wizard-set; only honored at first registration. Dashboard owns it
            # after that, so re-running the wizard never silently flips it.
            is_file_server=bool(data.get("is_file_server", False)),
        )
        db.session.add(c)

    c.last_heartbeat = utcnow()
    if "ip_address" in data:
        c.ip_address = data["ip_address"]
    if "uptime_seconds" in data:
        c.uptime_seconds = data["uptime_seconds"]
    if "storage_used_gb" in data:
        c.storage_used_gb = data["storage_used_gb"]
    if "agent_version" in data:
        c.agent_version = data["agent_version"]

    db.session.commit()
    return jsonify({"status": c.status, "computer_id": c.id})


@bp.get("/config")
def config():
    """Agent fetches its assigned jobs. Returns nothing if not approved."""
    name = request.args.get("computer_name", "").strip()
    if not name:
        return jsonify({"error": "computer_name required"}), 400

    c = db.session.execute(
        db.select(Computer).where(Computer.name == name)
    ).scalar_one_or_none()
    if not c:
        return jsonify({"status": "unknown", "jobs": []}), 404
    if c.status != "approved":
        return jsonify({"status": c.status, "jobs": [], "settings": {}})

    jobs = db.session.execute(
        db.select(SyncJob).where(SyncJob.source_computer_id == c.id, SyncJob.enabled == True)
    ).scalars().all()
    settings = {
        # Only emit non-NULL keys; agent falls back to its config defaults otherwise.
        k: v for k, v in {
            "metrics_interval_seconds": c.metrics_interval,
            "heartbeat_interval_seconds": c.heartbeat_interval,
            "poll_interval_seconds": c.poll_interval,
        }.items() if v is not None
    }
    # Process watchdog list — comma-separated names. Always emit (empty string
    # is meaningful: stop watching anything that was watched before).
    settings["watch_processes"] = c.watch_processes or ""
    # Effective auto-update source = per-PC override → lab default → "" (agent
    # falls back to whatever's in its local agent.json). We always emit so a
    # later "clear override" propagates.
    from ..models import get_settings
    lab = get_settings()
    effective_update_src = (c.update_source_path or "").strip() or (lab.central_build_path or "").strip()
    settings["update_source_path"] = effective_update_src
    # Admin-triggered "Push update" — agent compares ISO timestamp to its own
    # cached value and fires check_for_update when this jumps forward.
    if c.update_requested_at is not None:
        settings["update_requested_at"] = c.update_requested_at.isoformat()
    return jsonify({"status": "approved", "jobs": [j.to_dict() for j in jobs], "settings": settings})


@bp.post("/metrics")
def metrics():
    """Agent pushes a metrics snapshot. Stored in memory only."""
    data = request.get_json(silent=True) or {}
    name = (data.get("computer_name") or "").strip()
    if not name:
        return jsonify({"error": "computer_name required"}), 400
    c = db.session.execute(
        db.select(Computer).where(Computer.name == name)
    ).scalar_one_or_none()
    if not c:
        return jsonify({"error": "unknown computer"}), 404
    metrics_store.push(c.id, data)
    return jsonify({"ok": True})


@bp.get("/pending-syncs")
def pending_syncs():
    """Agent polls this to discover manually-triggered or scheduled jobs awaiting execution."""
    name = request.args.get("computer_name", "").strip()
    if not name:
        return jsonify({"error": "computer_name required"}), 400

    c = db.session.execute(
        db.select(Computer).where(Computer.name == name)
    ).scalar_one_or_none()
    if not c or c.status != "approved":
        return jsonify({"pending": []})

    rows = db.session.execute(
        db.select(SyncLog)
        .where(SyncLog.computer_id == c.id, SyncLog.status == "pending")
        .order_by(SyncLog.started_at.asc())
    ).scalars().all()

    out = []
    for log in rows:
        job = db.session.get(SyncJob, log.job_id)
        if not job:
            continue
        out.append({"log_id": log.id, "triggered_by": log.triggered_by, "job": job.to_dict()})
    return jsonify({"pending": out})


@bp.post("/initial-job")
def initial_job():
    """Agent calls this exactly once after a wizard install to seed its first sync job.
    Idempotent: if any job already exists for this computer, returns the existing list
    instead of creating a duplicate.
    """
    data = request.get_json(silent=True) or {}
    name = (data.get("computer_name") or "").strip()
    src = (data.get("source_folder_path") or "").strip()
    dst = (data.get("target_folder_path") or "").strip()
    if not (name and src and dst):
        return jsonify({"error": "computer_name, source_folder_path, target_folder_path required"}), 400

    c = db.session.execute(
        db.select(Computer).where(Computer.name == name)
    ).scalar_one_or_none()
    if not c:
        return jsonify({"error": "unknown computer"}), 404
    if c.status != "approved":
        return jsonify({"status": c.status, "created": False, "note": "computer not approved yet"})

    existing = db.session.execute(
        db.select(SyncJob).where(SyncJob.source_computer_id == c.id)
    ).scalars().all()
    if existing:
        return jsonify({"status": "approved", "created": False, "jobs": [j.to_dict() for j in existing]})

    job = SyncJob(
        name=f"{c.name} mirror",
        source_computer_id=c.id,
        source_folder_path=src,
        target_folder_path=dst,
        sync_direction="one-way",
        conflict_handling="skip-if-same-size",
        enabled=False,                # safety: review the analysis before going live
        watch_mode_enabled=True,
        watch_mode_delay_seconds=60,
        schedule_cron="0 6 * * *",
        analyze_status="pending",     # agent will scan source and post counts/size
    )
    db.session.add(job)
    db.session.commit()
    return jsonify({"status": "approved", "created": True, "jobs": [job.to_dict()]})


@bp.get("/jobs-pending-analysis")
def jobs_pending_analysis():
    """Agent fetches jobs that need a pre-sync scan."""
    name = request.args.get("computer_name", "").strip()
    if not name:
        return jsonify({"error": "computer_name required"}), 400
    c = db.session.execute(
        db.select(Computer).where(Computer.name == name)
    ).scalar_one_or_none()
    if not c or c.status != "approved":
        return jsonify({"jobs": []})
    rows = db.session.execute(
        db.select(SyncJob).where(
            SyncJob.source_computer_id == c.id,
            SyncJob.analyze_status == "pending",
        )
    ).scalars().all()
    return jsonify({"jobs": [{"id": j.id, "source_folder_path": j.source_folder_path} for j in rows]})


@bp.get("/pending-compares")
def pending_compares():
    """Agent fetches comparison requests for jobs belonging to it."""
    name = request.args.get("computer_name", "").strip()
    if not name:
        return jsonify({"error": "computer_name required"}), 400
    c = db.session.execute(
        db.select(Computer).where(Computer.name == name)
    ).scalar_one_or_none()
    if not c or c.status != "approved":
        return jsonify({"compares": []})
    rows = db.session.execute(
        db.select(JobCompare, SyncJob)
        .join(SyncJob, JobCompare.job_id == SyncJob.id)
        .where(SyncJob.source_computer_id == c.id, JobCompare.status == "pending")
    ).all()
    out = []
    for cmp, job in rows:
        out.append({
            "id": cmp.id,
            "job_id": job.id,
            "source_folder_path": job.source_folder_path,
            "target_folder_path": job.target_folder_path,
        })
    return jsonify({"compares": out})


@bp.post("/compare-result")
def compare_result():
    """Agent posts the result of a comparison."""
    data = request.get_json(silent=True) or {}
    cmp_id = data.get("id")
    if not cmp_id:
        return jsonify({"error": "id required"}), 400
    cmp = db.session.get(JobCompare, cmp_id)
    if not cmp:
        return jsonify({"error": "not found"}), 404
    cmp.status = data.get("status", "complete")
    cmp.new_count = data.get("new_count", 0)
    cmp.changed_count = data.get("changed_count", 0)
    cmp.unchanged_count = data.get("unchanged_count", 0)
    cmp.new_files = data.get("new_files")          # JSON string
    cmp.changed_files = data.get("changed_files")
    cmp.unchanged_files = data.get("unchanged_files")
    cmp.truncated = bool(data.get("truncated"))
    cmp.error_message = data.get("error_message")
    cmp.completed_at = utcnow()
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/job-analysis")
def job_analysis():
    """Agent posts the result of a pre-sync scan. Pi stores it and flips status to 'complete'."""
    data = request.get_json(silent=True) or {}
    job_id = data.get("job_id")
    if not job_id:
        return jsonify({"error": "job_id required"}), 400
    job = db.session.get(SyncJob, job_id)
    if not job:
        return jsonify({"error": "not found"}), 404
    job.analyze_status = data.get("status", "complete")
    job.analyze_file_count = data.get("file_count")
    job.analyze_total_bytes = data.get("total_bytes")
    job.analyze_largest_file = data.get("largest_file")
    job.analyze_largest_file_bytes = data.get("largest_file_bytes")
    job.analyze_extensions = data.get("extensions")  # JSON string
    job.analyze_truncated = bool(data.get("truncated"))
    job.analyze_error = data.get("error")
    job.analyze_at = utcnow()
    db.session.commit()
    return jsonify({"ok": True})


@bp.post("/log")
def log():
    """Agent reports a sync result.

    If `log_id` is provided, updates the existing pending log row (manual/scheduled trigger flow).
    Otherwise inserts a new row (agent-initiated, e.g. watch mode).
    """
    data = request.get_json(silent=True) or {}
    log_id = data.get("log_id")

    if log_id:
        entry = db.session.get(SyncLog, log_id)
        if not entry:
            return jsonify({"error": "log_id not found"}), 404
        for field in ("status", "files_copied", "files_skipped", "files_failed",
                      "error_message", "storage_delta_gb", "file_list"):
            if field in data:
                setattr(entry, field, data[field])
        if "completed_at" in data:
            entry.completed_at = _parse_iso(data["completed_at"]) or utcnow()
        else:
            entry.completed_at = utcnow()
        db.session.commit()
        if (entry.status or "").lower() in ("success", "failed"):
            alerts.on_sync_log_finished(entry)
        return jsonify({"ok": True, "log_id": entry.id})

    if not data.get("job_id"):
        return jsonify({"error": "job_id required (or log_id for updates)"}), 400

    # Derive computer_id from the job if the agent didn't supply it.
    computer_id = data.get("computer_id")
    if computer_id is None:
        job = db.session.get(SyncJob, data["job_id"])
        if job:
            computer_id = job.source_computer_id

    entry = SyncLog(
        job_id=data["job_id"],
        computer_id=computer_id,
        triggered_by=data.get("triggered_by", "manual"),
        started_at=_parse_iso(data.get("started_at")) or utcnow(),
        completed_at=_parse_iso(data.get("completed_at")) or utcnow(),
        status=data.get("status", "success"),
        files_copied=data.get("files_copied", 0),
        files_skipped=data.get("files_skipped", 0),
        files_failed=data.get("files_failed", 0),
        error_message=data.get("error_message"),
        storage_delta_gb=data.get("storage_delta_gb"),
        file_list=data.get("file_list"),
    )
    db.session.add(entry)
    db.session.commit()
    if (entry.status or "").lower() in ("success", "failed"):
        alerts.on_sync_log_finished(entry)
    return jsonify({"ok": True, "log_id": entry.id})


def _parse_iso(value):
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
