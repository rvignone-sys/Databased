"""Read-only log query."""
from flask import Blueprint, jsonify, request
from flask_login import login_required

from ..models import SyncLog, db


bp = Blueprint("logs", __name__, url_prefix="/api/logs")


@bp.get("")
@login_required
def list_logs():
    q = db.select(SyncLog)

    job_id = request.args.get("job_id", type=int)
    computer_id = request.args.get("computer_id", type=int)
    status = request.args.get("status")
    limit = request.args.get("limit", default=200, type=int)

    if job_id:
        q = q.where(SyncLog.job_id == job_id)
    if computer_id:
        q = q.where(SyncLog.computer_id == computer_id)
    if status:
        q = q.where(SyncLog.status == status)

    q = q.order_by(SyncLog.started_at.desc()).limit(min(limit, 1000))
    rows = db.session.execute(q).scalars().all()
    return jsonify([row.to_dict() for row in rows])
