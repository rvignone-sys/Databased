"""Computer management — list, approve, edit, delete."""
import json
from flask import Blueprint, current_app, jsonify, request, send_file
from flask_login import login_required, current_user

from datetime import timedelta, timezone
from io import BytesIO

from ..models import Computer, SyncLog, db, get_settings, utcnow
from ..crypto import encrypt, decrypt
from ..auth import admin_required
from ..metrics_store import store as metrics_store


bp = Blueprint("computers", __name__, url_prefix="/api/computers")


def _timeout() -> int:
    return current_app.config["HEARTBEAT_TIMEOUT"]


ACTIVITY_THRESHOLD_S = 300


def _activity_24h_buckets(computer_id: int) -> list[float]:
    """Per-hour file-copy totals over the last 24h, normalized to 0..1.
    Index 0 = oldest hour, index 23 = current hour. Fed into the card sparkline.
    """
    now = utcnow()
    cutoff = now - timedelta(hours=24)
    rows = db.session.execute(
        db.select(SyncLog.started_at, SyncLog.files_copied)
        .where(SyncLog.computer_id == computer_id, SyncLog.started_at >= cutoff)
    ).all()
    buckets = [0] * 24
    for ts, copied in rows:
        if ts is None:
            continue
        if ts.tzinfo is None:
            ts = ts.replace(tzinfo=timezone.utc)
        delta_h = int((now - ts).total_seconds() / 3600)
        if 0 <= delta_h < 24:
            buckets[23 - delta_h] += int(copied or 0)
    if not any(buckets):
        return buckets
    peak = max(buckets) or 1
    return [round(b / peak, 3) for b in buckets]


def _activity_signal(computer_id: int) -> str | None:
    """Computes the live "in use" signal from the latest metrics sample.
    Returns None | 'user' | 'data' | 'user+data'."""
    sample = metrics_store.latest(computer_id)
    if not sample:
        return None
    idle = sample.get("idle_seconds")
    file_age = sample.get("last_file_event_seconds")
    user_active = idle is not None and idle < ACTIVITY_THRESHOLD_S
    data_active = file_age is not None and file_age < ACTIVITY_THRESHOLD_S
    if user_active and data_active:
        return "user+data"
    if user_active:
        return "user"
    if data_active:
        return "data"
    return None


@bp.get("")
@login_required
def list_computers():
    status = request.args.get("status")
    q = db.select(Computer)
    if status:
        q = q.where(Computer.status == status)
    rows = db.session.execute(q.order_by(Computer.created_at.desc())).scalars().all()
    out = []
    for c in rows:
        d = c.to_public_dict(_timeout())
        d["activity"] = _activity_signal(c.id)
        d["activity_24h"] = _activity_24h_buckets(c.id)
        out.append(d)
    return jsonify(out)


@bp.post("/<int:existing_id>/adopt")
@admin_required
def adopt(existing_id: int):
    """Merge a pending computer into an approved one.

    Carries the new agent's identity (name, ip, agent_version, latest heartbeat)
    onto the existing approved row, then deletes the pending row. Existing
    sync_jobs and sync_logs are preserved because they FK on existing.id.
    """
    data = request.get_json(silent=True) or {}
    pending_id = data.get("pending_id")
    if not pending_id:
        return jsonify({"error": "pending_id required"}), 400
    if pending_id == existing_id:
        return jsonify({"error": "cannot adopt a computer into itself"}), 400

    existing = db.session.get(Computer, existing_id)
    pending = db.session.get(Computer, pending_id)
    if not existing or not pending:
        return jsonify({"error": "not found"}), 404
    if existing.status != "approved":
        return jsonify({"error": "target instrument must be approved first"}), 400
    if pending.status != "pending":
        return jsonify({"error": "source must be a pending computer"}), 400

    # Snapshot what we're carrying over, then delete pending FIRST so the
    # name-unique constraint doesn't fire when we copy the new name onto existing.
    new_name = pending.name
    new_ip = pending.ip_address
    new_version = pending.agent_version
    new_hb = pending.last_heartbeat
    new_uptime = pending.uptime_seconds
    new_storage = pending.storage_used_gb

    db.session.delete(pending)
    db.session.flush()

    existing.name = new_name
    existing.ip_address = new_ip
    existing.agent_version = new_version
    existing.last_heartbeat = new_hb
    existing.uptime_seconds = new_uptime
    existing.storage_used_gb = new_storage

    db.session.commit()
    return jsonify(existing.to_public_dict(_timeout()))


@bp.post("/<int:computer_id>/approve")
@admin_required
def approve(computer_id: int):
    c = db.session.get(Computer, computer_id)
    if not c:
        return jsonify({"error": "not found"}), 404
    c.status = "approved"
    c.approved_at = utcnow()
    db.session.commit()
    return jsonify(c.to_public_dict(_timeout()))


@bp.patch("/<int:computer_id>")
@login_required
def update(computer_id: int):
    """Admin-only for most fields; non-admins are restricted to flipping
    `internet_enabled` (the wifi toggle on the dashboard card)."""
    c = db.session.get(Computer, computer_id)
    if not c:
        return jsonify({"error": "not found"}), 404

    data = request.get_json(silent=True) or {}

    if not current_user.is_admin:
        if set(data.keys()) - {"internet_enabled"}:
            return jsonify({"error": "non-admins may only toggle internet_enabled"}), 403

    for field in (
        "name", "icon_type", "rdp_username", "rdp_port", "rdp_security_mode",
        "remote_protocol",
        "metrics_interval", "heartbeat_interval", "poll_interval",
        "is_file_server",
        "device_kind",
        "category",
        "watch_processes",
        "update_source_path",
        "internet_enabled",
    ):
        if field in data:
            setattr(c, field, data[field])
    if "monitored_disk_mounts" in data:
        v = data["monitored_disk_mounts"]
        if v is None or v == "":
            c.monitored_disk_mounts = None
        elif isinstance(v, list):
            cleaned = [str(x) for x in v if x]
            c.monitored_disk_mounts = json.dumps(cleaned) if cleaned else None
        else:
            return jsonify({"error": "monitored_disk_mounts must be a list"}), 400
    # Stamp the enable time so the watchdog auto-off has a grace anchor.
    if "internet_enabled" in data:
        c.internet_enabled_at = utcnow() if data["internet_enabled"] else None

    if "rdp_password" in data:
        pw = data["rdp_password"]
        c.rdp_password_encrypted = encrypt(pw) if pw else None

    db.session.commit()
    # If internet_enabled changed in this PATCH, reconcile tinyproxy now so
    # the click-to-toggle feels instant rather than waiting for the 5-min sync.
    if "internet_enabled" in data:
        from .. import tunnel
        from flask import current_app
        tunnel.sync(current_app._get_current_object())
    return jsonify(c.to_public_dict(_timeout()))


@bp.post("/<int:computer_id>/rdp-session")
@login_required
def rdp_session(computer_id: int):
    """Mint a Guacamole session for in-browser RDP.

    Username is the dashboard-logged-in user's username — Guacamole prompts
    for the matching Windows password the first time, then caches it.
    """
    from ..guacamole import mint_session, GuacamoleError
    c = db.session.get(Computer, computer_id)
    if not c:
        return jsonify({"error": "not found"}), 404
    if c.status != "approved":
        return jsonify({"error": "computer must be approved"}), 400
    if not c.ip_address:
        return jsonify({"error": "no IP address recorded"}), 400
    # Per-computer overrides take priority over the dashboard user's identity.
    # Set rdp_username/rdp_password in the gear modal to enable 1-click connect
    # for everyone using the dashboard.
    protocol = (c.remote_protocol or "rdp").lower()
    # VNC has no username; RDP falls back to dashboard user if no override set.
    rdp_user = None if protocol == "vnc" else (c.rdp_username or current_user.username)
    rdp_pass = None
    if c.rdp_password_encrypted:
        try:
            rdp_pass = decrypt(c.rdp_password_encrypted)
        except Exception:  # noqa: BLE001
            rdp_pass = None  # corrupt ciphertext → fall through to prompt

    # Protocol-appropriate default port if rdp_port wasn't set explicitly.
    default_port = 5900 if protocol == "vnc" else 3389
    port = c.rdp_port or default_port

    try:
        payload = mint_session(
            name=c.name,
            hostname=c.ip_address,
            port=port,
            username=rdp_user,
            security_mode=c.rdp_security_mode or "any",
            password=rdp_pass,
            protocol=protocol,
        )
    except GuacamoleError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Guacamole unavailable: {exc}"}), 503

    # Rewrite the URL so it points at the Pi's public address (the same host
    # the browser used to reach Flask), not the loopback Guacamole sees.
    try:
        import os as _os
        from urllib.parse import urlparse, urlunparse
        parsed = urlparse(request.host_url.rstrip("/"))
        public_host = parsed.hostname or "127.0.0.1"
        guac_port = _os.environ.get("GUAC_HOST_PORT", "8081")
        new_netloc = f"{public_host}:{guac_port}"
        old = urlparse(payload["url"])
        payload["url"] = urlunparse((parsed.scheme, new_netloc, old.path, old.params, old.query, old.fragment))
        payload["guacamole_base"] = f"{parsed.scheme}://{new_netloc}"
    except Exception:  # noqa: BLE001
        pass

    return jsonify(payload)


@bp.get("/<int:computer_id>/rdp.rdp")
@login_required
def rdp_file(computer_id: int):
    """Generate a .rdp file for this computer pre-populated with the dashboard
    user's username. Password is NOT embedded — Windows prompts on first use,
    Credential Manager remembers it for subsequent connects.
    """
    c = db.session.get(Computer, computer_id)
    if not c:
        return jsonify({"error": "not found"}), 404
    if c.status != "approved":
        return jsonify({"error": "computer must be approved"}), 400
    if not c.ip_address:
        return jsonify({"error": "no IP address recorded"}), 400

    address = f"{c.ip_address}:{c.rdp_port or 3389}"
    body = (
        "screen mode id:i:2\r\n"
        "use multimon:i:0\r\n"
        f"full address:s:{address}\r\n"
        f"username:s:{current_user.username}\r\n"
        "prompt for credentials:i:1\r\n"
        "authentication level:i:2\r\n"
        "audiomode:i:2\r\n"
        "redirectprinters:i:0\r\n"
        "redirectcomports:i:0\r\n"
        "redirectsmartcards:i:0\r\n"
        "redirectclipboard:i:1\r\n"
        "displayconnectionbar:i:1\r\n"
        "autoreconnection enabled:i:1\r\n"
        "bitmapcachepersistenable:i:1\r\n"
    )
    buf = BytesIO(body.encode("utf-8"))
    safe_name = "".join(ch if ch.isalnum() or ch in "-_." else "_" for ch in c.name)
    return send_file(
        buf,
        mimetype="application/x-rdp",
        as_attachment=True,
        download_name=f"{safe_name}.rdp",
    )


@bp.get("/<int:computer_id>/metrics")
@login_required
def get_metrics(computer_id: int):
    c = db.session.get(Computer, computer_id)
    if not c:
        return jsonify({"error": "not found"}), 404
    return jsonify({
        "latest": metrics_store.latest(computer_id),
        "history": metrics_store.history(computer_id),
    })


@bp.post("/<int:computer_id>/push-update")
@admin_required
def push_update(computer_id: int):
    """Bump the agent's update_requested_at timestamp. Agent picks it up on
    its next /agent/config poll and runs check_for_update immediately."""
    c = db.session.get(Computer, computer_id)
    if not c:
        return jsonify({"error": "not found"}), 404
    c.update_requested_at = utcnow()
    db.session.commit()
    return jsonify({"ok": True, "requested_at": c.update_requested_at.isoformat()})


@bp.post("/push-update-all")
@admin_required
def push_update_all():
    """Bump update_requested_at on every approved computer at once. Also
    stamps LabSettings.last_pushed_at so the build-ready badge clears."""
    rows = db.session.execute(
        db.select(Computer).where(Computer.status == "approved")
    ).scalars().all()
    now = utcnow()
    for c in rows:
        c.update_requested_at = now
    s = get_settings()
    s.last_pushed_at = now
    db.session.commit()
    return jsonify({"ok": True, "count": len(rows), "requested_at": now.isoformat()})


@bp.post("/host-vnc-session")
@admin_required
def host_vnc_session():
    """Mint a Guacamole session into the Pi's own remote-desktop server
    (loopback). Defaults to RDP/3389 because xrdp is what we install on
    the Pi (xrdp creates its own X session at the connecting client's
    resolution, sidesteps the headless-Pi tiny-viewport problem VNC has).

    Override via env vars if you switch back to VNC or use a different port:
      PI_HOST_PROTOCOL=vnc
      PI_HOST_PORT=5900
    """
    from ..guacamole import mint_session, GuacamoleError
    import os as _os
    from urllib.parse import urlparse, urlunparse

    protocol = (_os.environ.get("PI_HOST_PROTOCOL") or "vnc").lower()
    default_port = 3389 if protocol == "rdp" else 5900
    port = int(_os.environ.get("PI_HOST_PORT", str(default_port)))
    try:
        # Docker bridge gateway → host loopback. Override if guacd is on a
        # custom Docker network. 172.17.0.1 = default bridge; 172.18.0.1 =
        # docker-compose's user-defined bridge (which guacd usually lives on).
        target_host = _os.environ.get("PI_HOST_FOR_GUACD", "172.18.0.1")
        # Optional pre-shared VNC/RDP password — set in the systemd unit's
        # Environment= so the in-browser session auto-auths without prompting.
        # Required for x11vnc (rfbauth) since guacd has no other way to know
        # the password. Leave unset to let Guacamole prompt the user.
        host_password = _os.environ.get("PI_HOST_PASSWORD") or None
        payload = mint_session(
            name="Pi Host",
            hostname=target_host,
            port=port,
            username=None,
            security_mode="any",
            password=host_password,
            protocol=protocol,
        )
        payload["protocol"] = protocol  # let the frontend label the modal correctly
    except GuacamoleError as exc:
        return jsonify({"error": str(exc)}), 503
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"Guacamole unavailable: {exc}"}), 503

    # Same URL rewrite as rdp_session — point at the Pi's public host.
    try:
        parsed = urlparse(request.host_url.rstrip("/"))
        public_host = parsed.hostname or "127.0.0.1"
        guac_port = _os.environ.get("GUAC_HOST_PORT", "8081")
        new_netloc = f"{public_host}:{guac_port}"
        old = urlparse(payload["url"])
        payload["url"] = urlunparse((parsed.scheme, new_netloc, old.path, old.params, old.query, old.fragment))
        payload["guacamole_base"] = f"{parsed.scheme}://{new_netloc}"
    except Exception:  # noqa: BLE001
        pass
    return jsonify(payload)


@bp.get("/tunnel-status")
@login_required
def tunnel_status():
    """Live tinyproxy state — whether it's running and which IPs it allows.
    Dashboard polls this for the wifi-toggle's "running" indicator."""
    from .. import tunnel
    return jsonify(tunnel.status())


@bp.post("/tunnel-sync")
@admin_required
def tunnel_sync():
    """Force ACL rebuild now (rather than waiting for the 5-min tick)."""
    from .. import tunnel
    from flask import current_app
    return jsonify(tunnel.sync(current_app._get_current_object()))


@bp.get("/build-status")
@login_required
def build_status():
    """Whether a newer agent build sits on the share than was last pushed.

    Reads <central_build_path_pi>/databased-agent/databased-agent.exe mtime
    and compares to LabSettings.last_pushed_at. Returns a friendly summary
    suitable for a (!) badge on the dashboard."""
    from pathlib import Path
    from datetime import timezone
    s = get_settings()
    pi_path = (s.central_build_path_pi or "").strip()
    if not pi_path:
        return jsonify({
            "configured": False,
            "build_available": False,
            "reason": "central_build_path_pi not set in Settings → Fleet",
        })
    exe = Path(pi_path) / "databased-agent" / "databased-agent.exe"
    if not exe.exists():
        return jsonify({
            "configured": True,
            "build_available": False,
            "reason": f"no exe at {exe}",
            "build_mtime": None,
            "last_pushed_at": s.last_pushed_at.isoformat() if s.last_pushed_at else None,
        })
    try:
        mtime = exe.stat().st_mtime
    except OSError as exc:
        return jsonify({"configured": True, "build_available": False, "reason": str(exc)})
    from datetime import datetime
    build_dt = datetime.fromtimestamp(mtime, tz=timezone.utc)
    last_pushed = s.last_pushed_at
    if last_pushed is not None and last_pushed.tzinfo is None:
        last_pushed = last_pushed.replace(tzinfo=timezone.utc)
    available = (last_pushed is None) or (build_dt > last_pushed)
    return jsonify({
        "configured": True,
        "build_available": available,
        "build_mtime": build_dt.isoformat(),
        "last_pushed_at": last_pushed.isoformat() if last_pushed else None,
        "build_size_bytes": exe.stat().st_size,
    })


@bp.delete("/<int:computer_id>")
@admin_required
def delete(computer_id: int):
    c = db.session.get(Computer, computer_id)
    if not c:
        return jsonify({"error": "not found"}), 404
    db.session.delete(c)
    db.session.commit()
    return jsonify({"ok": True})
