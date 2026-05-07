"""Lab-wide settings + logo upload."""
from pathlib import Path

from flask import Blueprint, current_app, jsonify, request, send_file
from flask_login import login_required
from werkzeug.utils import secure_filename

from ..models import LabSettings, db, get_settings
from ..auth import admin_required
from .. import notify as notifier


bp = Blueprint("settings", __name__, url_prefix="/api/settings")


ALLOWED_LOGO_EXT = {"png", "jpg", "jpeg", "webp", "svg"}
MAX_LOGO_BYTES = 2 * 1024 * 1024  # 2 MB


def _logo_dir() -> Path:
    p = Path(current_app.root_path).parent / "pi" / "data" / "uploads"
    p.mkdir(parents=True, exist_ok=True)
    return p


@bp.get("")
@login_required
def get_all():
    return jsonify(get_settings().to_dict())


@bp.patch("")
@admin_required
def update():
    data = request.get_json(silent=True) or {}
    s = get_settings()
    for field in ("lab_name", "central_storage_path", "central_build_path",
                  "central_build_path_pi",
                  "dashboard_heading",
                  "slack_webhook_url",
                  "slack_notify_success", "slack_notify_failure", "slack_notify_manual",
                  "pause_at_storage_pct"):
        if field in data:
            setattr(s, field, data[field])
    db.session.commit()
    return jsonify(s.to_dict())


@bp.post("/test-notify")
@admin_required
def test_notify():
    """Fire a one-off test notification through the configured webhook.
    Returns 200 on delivery, 400 if no URL set, 502 on POST failure."""
    s = get_settings()
    if not (s.slack_webhook_url or "").strip():
        return jsonify({"ok": False, "error": "no webhook URL configured"}), 400
    ok, reason = notifier.test_notify()
    return (jsonify({"ok": True, "detail": reason}), 200) if ok else (
        jsonify({"ok": False, "error": reason}), 502)


@bp.post("/logo")
@admin_required
def upload_logo():
    if "file" not in request.files:
        return jsonify({"error": "no file part"}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "empty filename"}), 400
    ext = f.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_LOGO_EXT:
        return jsonify({"error": f"extension must be one of {sorted(ALLOWED_LOGO_EXT)}"}), 400

    raw = f.read(MAX_LOGO_BYTES + 1)
    if len(raw) > MAX_LOGO_BYTES:
        return jsonify({"error": "file too large (max 2 MB)"}), 413

    name = f"lab_logo.{ext}"
    out = _logo_dir() / name
    out.write_bytes(raw)

    # Drop any older logo file with a different extension.
    for sib in _logo_dir().glob("lab_logo.*"):
        if sib.name != name:
            sib.unlink(missing_ok=True)

    s = get_settings()
    s.logo_filename = name
    db.session.commit()
    return jsonify({"ok": True, "filename": name})


@bp.delete("/logo")
@admin_required
def delete_logo():
    for f in _logo_dir().glob("lab_logo.*"):
        f.unlink(missing_ok=True)
    s = get_settings()
    s.logo_filename = None
    db.session.commit()
    return jsonify({"ok": True})


@bp.get("/logo")
def serve_logo():
    """Public — used as the favicon and the sidebar mark."""
    s = db.session.get(LabSettings, 1)
    if not s or not s.logo_filename:
        return jsonify({"error": "no logo set"}), 404
    path = _logo_dir() / s.logo_filename
    if not path.exists():
        return jsonify({"error": "logo file missing"}), 404
    # Guess MIME from extension
    ext = path.suffix.lstrip(".").lower()
    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
            "webp": "image/webp", "svg": "image/svg+xml"}.get(ext, "application/octet-stream")
    return send_file(path, mimetype=mime, max_age=60)
