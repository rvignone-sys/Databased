import json
from datetime import datetime, timezone
from flask_sqlalchemy import SQLAlchemy
from flask_login import UserMixin

db = SQLAlchemy()


def utcnow():
    return datetime.now(timezone.utc)


def _parse_mounts(raw):
    """Decode the JSON-encoded mount list. Tolerates None / legacy strings."""
    if not raw:
        return []
    try:
        v = json.loads(raw)
        if isinstance(v, list):
            return [str(x) for x in v if x]
    except (ValueError, TypeError):
        pass
    return []


class User(UserMixin, db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(64), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    # 'admin' = full control (add/remove computers, edit settings, manage users)
    # 'user'  = view + RDP only
    role = db.Column(db.String(16), default="admin", nullable=False)
    # 'dark' | 'light' — persists across browsers via /api/auth/me
    theme = db.Column(db.String(8), default="dark")
    created_at = db.Column(db.DateTime, default=utcnow)

    @property
    def is_admin(self) -> bool:
        return self.role == "admin"

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "theme": self.theme or "dark",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Computer(db.Model):
    __tablename__ = "computers"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(64), unique=True, nullable=False)
    ip_address = db.Column(db.String(64))
    status = db.Column(db.String(16), default="pending", nullable=False)  # pending|approved|disabled
    last_heartbeat = db.Column(db.DateTime)
    uptime_seconds = db.Column(db.Integer)
    storage_used_gb = db.Column(db.Float)
    agent_version = db.Column(db.String(32))
    icon_type = db.Column(db.String(32), default="computer")
    # Coarse classification used by the dashboard to pick how much detail to
    # show — 'instrument' (lab gear that produces data), 'pc' (workstation),
    # or 'server' (file server / orchestrator / shared infra). Independent
    # of icon_type, which is purely visual.
    device_kind = db.Column(db.String(16), default="pc")

    # 'rdp' (Windows native, requires Windows account) or 'vnc' (cross-edition,
    # uses VNC server's own password). Stored creds are reused for both — the
    # username field is unused for VNC. Default is VNC because it works
    # without a Windows admin account on every edition (Home/Pro/etc).
    remote_protocol = db.Column(db.String(8), default="vnc")
    rdp_username = db.Column(db.String(128))
    rdp_password_encrypted = db.Column(db.String(512))
    rdp_port = db.Column(db.Integer, default=5900)
    rdp_security_mode = db.Column(db.String(16), default="any")  # any|nla|rdp|tls

    # Pushed to the agent on each /agent/config poll. NULL = use agent's local default.
    metrics_interval = db.Column(db.Integer)
    heartbeat_interval = db.Column(db.Integer)
    poll_interval = db.Column(db.Integer)

    # The file server / NAS role. Multiple allowed (not exclusive); the dashboard
    # surfaces the first one as the always-visible File Server panel.
    is_file_server = db.Column(db.Boolean, default=False)

    # Stable identifier the agent generates on first run (UUID4 stored as
    # 36-char string). Heartbeats prefer this over `name` so renaming a
    # device on the dashboard doesn't cause the agent to re-register as a
    # new pending machine. NULL for legacy rows; backfilled on first heartbeat.
    agent_id = db.Column(db.String(36), unique=True, index=True)

    # JSON-encoded list of mount paths to monitor in the File Server panel
    # (e.g. ["D:\\", "E:\\"] on Windows; ["/mnt/share"] on Linux). Empty/NULL
    # = show all mounts the agent reports (legacy behavior).
    monitored_disk_mounts = db.Column(db.Text)

    # Comma-separated process names the agent should report up/down for
    # (e.g. "Xcalibur.exe, Chromeleon.exe"). Empty = no watchdog.
    watch_processes = db.Column(db.String(512))

    # Per-PC override for the auto-update source path. NULL = inherit lab
    # default from LabSettings.central_build_path. Useful for testing a build
    # on one PC before rolling out fleet-wide.
    update_source_path = db.Column(db.String(512))

    # Whether this PC is allowed to use the Pi's internet tunnel (tinyproxy).
    # Default off — user enables per-PC via the dashboard wifi toggle.
    # When at least one PC has this true, tinyproxy runs and its ACL is
    # rebuilt to allow exactly those PCs' IPs.
    internet_enabled = db.Column(db.Boolean, default=False, nullable=False)
    # Stamped on toggle-on. Used as the grace-period anchor for the auto-off
    # watchdog (don't disable a freshly-enabled tunnel even if the user is
    # currently idle — give them time to come back to the keyboard).
    internet_enabled_at = db.Column(db.DateTime)

    # Set by admin "Push update" → agent compares to its locally cached value
    # on each /agent/config fetch and runs check_for_update if newer.
    update_requested_at = db.Column(db.DateTime)

    created_at = db.Column(db.DateTime, default=utcnow)
    approved_at = db.Column(db.DateTime)

    jobs = db.relationship("SyncJob", backref="computer", cascade="all, delete-orphan")

    def is_online(self, timeout_seconds: int) -> bool:
        if not self.last_heartbeat:
            return False
        delta = (utcnow() - self.last_heartbeat.replace(tzinfo=timezone.utc)).total_seconds()
        return delta < timeout_seconds

    def to_public_dict(self, timeout_seconds: int) -> dict:
        """Shape used by dashboard. Excludes secrets."""
        return {
            "id": self.id,
            "name": self.name,
            "ip_address": self.ip_address,
            "status": self.status,
            "icon_type": self.icon_type,
            "is_online": self.is_online(timeout_seconds),
            "last_heartbeat": self.last_heartbeat.isoformat() if self.last_heartbeat else None,
            "uptime_seconds": self.uptime_seconds,
            "storage_used_gb": self.storage_used_gb,
            "agent_version": self.agent_version,
            "remote_protocol": self.remote_protocol or "rdp",
            "rdp_username": self.rdp_username,
            "rdp_configured": bool(self.rdp_password_encrypted) and (
                bool(self.rdp_username) if (self.remote_protocol or "rdp") == "rdp" else True
            ),
            "rdp_port": self.rdp_port,
            "rdp_security_mode": self.rdp_security_mode,
            "metrics_interval": self.metrics_interval,
            "heartbeat_interval": self.heartbeat_interval,
            "poll_interval": self.poll_interval,
            "is_file_server": bool(self.is_file_server),
            "agent_id": self.agent_id or "",
            "monitored_disk_mounts": _parse_mounts(self.monitored_disk_mounts),
            "device_kind": (self.device_kind or "pc"),
            "watch_processes": self.watch_processes or "",
            "update_source_path": self.update_source_path or "",
            "internet_enabled": bool(self.internet_enabled),
            "approved_at": self.approved_at.isoformat() if self.approved_at else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SyncJob(db.Model):
    __tablename__ = "sync_jobs"
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(128), nullable=False)
    source_computer_id = db.Column(db.Integer, db.ForeignKey("computers.id"), nullable=False)
    source_folder_path = db.Column(db.String(512), nullable=False)
    target_folder_path = db.Column(db.String(512), nullable=False)
    sync_direction = db.Column(db.String(16), default="one-way")
    conflict_handling = db.Column(db.String(32), default="skip")
    enabled = db.Column(db.Boolean, default=True)
    schedule_cron = db.Column(db.String(64))
    watch_mode_enabled = db.Column(db.Boolean, default=False)
    watch_mode_delay_seconds = db.Column(db.Integer, default=30)
    created_at = db.Column(db.DateTime, default=utcnow)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    # Pre-sync analysis (safety check before letting a fresh job auto-run).
    # status: NULL (skipped) | 'pending' | 'running' | 'complete' | 'failed'
    analyze_status = db.Column(db.String(16))
    analyze_file_count = db.Column(db.Integer)
    analyze_total_bytes = db.Column(db.BigInteger)
    analyze_largest_file = db.Column(db.String(512))
    analyze_largest_file_bytes = db.Column(db.BigInteger)
    analyze_extensions = db.Column(db.Text)  # JSON: {".csv": 100, ".bin": 50}
    analyze_truncated = db.Column(db.Boolean, default=False)
    analyze_error = db.Column(db.Text)
    analyze_at = db.Column(db.DateTime)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "source_computer_id": self.source_computer_id,
            "source_folder_path": self.source_folder_path,
            "target_folder_path": self.target_folder_path,
            "sync_direction": self.sync_direction,
            "conflict_handling": self.conflict_handling,
            "enabled": self.enabled,
            "schedule_cron": self.schedule_cron,
            "watch_mode_enabled": self.watch_mode_enabled,
            "watch_mode_delay_seconds": self.watch_mode_delay_seconds,
            "analyze_status": self.analyze_status,
            "analyze_file_count": self.analyze_file_count,
            "analyze_total_bytes": self.analyze_total_bytes,
            "analyze_largest_file": self.analyze_largest_file,
            "analyze_largest_file_bytes": self.analyze_largest_file_bytes,
            "analyze_extensions": self.analyze_extensions,
            "analyze_truncated": self.analyze_truncated,
            "analyze_error": self.analyze_error,
            "analyze_at": self.analyze_at.isoformat() if self.analyze_at else None,
        }


class SyncLog(db.Model):
    __tablename__ = "sync_logs"
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey("sync_jobs.id"))
    computer_id = db.Column(db.Integer, db.ForeignKey("computers.id"))
    triggered_by = db.Column(db.String(16))  # schedule|watch|manual
    started_at = db.Column(db.DateTime, default=utcnow)
    completed_at = db.Column(db.DateTime)
    status = db.Column(db.String(16))  # pending|running|success|failed
    files_copied = db.Column(db.Integer, default=0)
    files_skipped = db.Column(db.Integer, default=0)
    files_failed = db.Column(db.Integer, default=0)
    error_message = db.Column(db.Text)
    storage_delta_gb = db.Column(db.Float)
    # Newline-separated relative paths of files copied/skipped/failed during this run.
    file_list = db.Column(db.Text)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "job_id": self.job_id,
            "computer_id": self.computer_id,
            "triggered_by": self.triggered_by,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "status": self.status,
            "files_copied": self.files_copied,
            "files_skipped": self.files_skipped,
            "files_failed": self.files_failed,
            "error_message": self.error_message,
            "storage_delta_gb": self.storage_delta_gb,
            "file_list": self.file_list,
        }


class JobCompare(db.Model):
    """Async source-vs-target comparison for a sync job. Used by the dashboard's
    Compare modal: dashboard creates a row → agent picks it up on its next poll
    → walks both folders → posts results back. Stored as JSON-encoded lists,
    capped to a few hundred entries with a `truncated` flag."""
    __tablename__ = "job_compares"
    id = db.Column(db.Integer, primary_key=True)
    job_id = db.Column(db.Integer, db.ForeignKey("sync_jobs.id"), nullable=False)
    requested_at = db.Column(db.DateTime, default=utcnow, nullable=False)
    completed_at = db.Column(db.DateTime)
    status = db.Column(db.String(16), default="pending")  # pending|running|complete|failed
    new_count = db.Column(db.Integer, default=0)
    changed_count = db.Column(db.Integer, default=0)
    unchanged_count = db.Column(db.Integer, default=0)
    new_files = db.Column(db.Text)         # JSON list: [{"path","size"}, ...]
    changed_files = db.Column(db.Text)     # JSON list: [{"path","src_size","dst_size"}, ...]
    unchanged_files = db.Column(db.Text)   # JSON list: [{"path","size"}, ...]
    truncated = db.Column(db.Boolean, default=False)
    error_message = db.Column(db.Text)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "job_id": self.job_id,
            "requested_at": self.requested_at.isoformat() if self.requested_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "status": self.status,
            "new_count": self.new_count or 0,
            "changed_count": self.changed_count or 0,
            "unchanged_count": self.unchanged_count or 0,
            "new_files": self.new_files,           # already JSON string
            "changed_files": self.changed_files,
            "unchanged_files": self.unchanged_files,
            "truncated": bool(self.truncated),
            "error_message": self.error_message,
        }


class SlackConfig(db.Model):
    __tablename__ = "slack_config"
    id = db.Column(db.Integer, primary_key=True)
    webhook_url = db.Column(db.String(512))
    notify_on_success = db.Column(db.Boolean, default=False)
    notify_on_failure = db.Column(db.Boolean, default=True)
    notify_on_manual_trigger = db.Column(db.Boolean, default=False)
    custom_message_template = db.Column(db.Text)


class LabSettings(db.Model):
    """Singleton row (id=1) holding lab-wide settings shown on the Settings page."""
    __tablename__ = "lab_settings"
    id = db.Column(db.Integer, primary_key=True)
    lab_name = db.Column(db.String(128), default="DataBased Lab")
    central_storage_path = db.Column(db.String(512))
    logo_filename = db.Column(db.String(128))  # NULL = use default SVG hex
    slack_webhook_url = db.Column(db.String(512))
    slack_notify_success = db.Column(db.Boolean, default=False)
    slack_notify_failure = db.Column(db.Boolean, default=True)
    slack_notify_manual = db.Column(db.Boolean, default=False)
    pause_at_storage_pct = db.Column(db.Integer, default=90)  # 0 = disabled
    # Where the build user uploads new agent builds — same path every PC
    # checks for updates by default. Per-PC override lives on Computer.
    # central_build_path is the Windows UNC path the agents see; central_build_path_pi
    # is the Pi-local mount (so the Pi can stat the file for the build-ready badge).
    central_build_path = db.Column(db.String(512))
    central_build_path_pi = db.Column(db.String(512))
    # Heading shown above the device cards on the dashboard. Configurable so
    # forks/installers can rename it ("Fleet", "Instruments", "Devices", etc.).
    # Falls back to "Lab Overview" when blank.
    dashboard_heading = db.Column(db.String(128))
    # Stamped on Push update to all — the badge fires when build mtime > this.
    last_pushed_at = db.Column(db.DateTime)
    updated_at = db.Column(db.DateTime, default=utcnow, onupdate=utcnow)

    def to_dict(self) -> dict:
        return {
            "lab_name": self.lab_name or "DataBased Lab",
            "central_storage_path": self.central_storage_path or "",
            "has_logo": bool(self.logo_filename),
            "slack_webhook_url": self.slack_webhook_url or "",
            "slack_notify_success": self.slack_notify_success,
            "slack_notify_failure": self.slack_notify_failure,
            "slack_notify_manual": self.slack_notify_manual,
            "pause_at_storage_pct": self.pause_at_storage_pct,
            "central_build_path": self.central_build_path or "",
            "central_build_path_pi": self.central_build_path_pi or "",
            "dashboard_heading": self.dashboard_heading or "",
            "last_pushed_at": self.last_pushed_at.isoformat() if self.last_pushed_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }


def get_settings() -> LabSettings:
    """Return the singleton LabSettings row, creating it on first access."""
    s = db.session.get(LabSettings, 1)
    if s is None:
        s = LabSettings(id=1)
        db.session.add(s)
        db.session.commit()
    return s


class InstrumentType(db.Model):
    """Admin-managed master list of instrument types. The `key` is what
    Computer.icon_type stores and what icons.js looks up; `label` is the
    human-readable name shown in dropdowns. `notes` is a free-text field for
    future expansion (per-type docs, default folders, etc.).

    Icon resolution priority at render time:
      1. svg          — sanitized custom SVG markup pasted by the admin
      2. lucide_name  — kebab-case Lucide icon name (e.g. "flask-conical")
      3. key          — built-in glyph from icons.jsx ICON_MAP
      4. fallback     — generic Computer icon
    """
    __tablename__ = "instrument_types"
    id = db.Column(db.Integer, primary_key=True)
    key = db.Column(db.String(32), unique=True, nullable=False)
    label = db.Column(db.String(128), nullable=False)
    sort_order = db.Column(db.Integer, default=100)
    notes = db.Column(db.Text)
    # Optional admin-supplied icon sources (see priority order above).
    svg = db.Column(db.Text)
    lucide_name = db.Column(db.String(64))
    created_at = db.Column(db.DateTime, default=utcnow)

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "key": self.key,
            "label": self.label,
            "sort_order": self.sort_order or 100,
            "notes": self.notes or "",
            "svg": self.svg or "",
            "lucide_name": self.lucide_name or "",
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


# Seed list — also the canonical mapping the icons.js SVGs are keyed by.
# New types beyond these will fall back to a generic icon until someone
# draws one for them.
DEFAULT_INSTRUMENT_TYPES = [
    # Generic — what new agents come in as until an admin reclassifies them.
    ("computer", "Computer",          0),
    ("orbitrap", "LC-HRMS Orbitrap", 10),
    ("smps",     "Aerosol Sizing",   20),
    ("chamber",  "Environmental Chamber", 30),
    ("gcms",     "GC-MS",            40),
    ("gcfid",    "GC-FID",           50),
    ("uvvis",    "UV-Vis",           60),
]


def seed_instrument_types() -> int:
    """Insert any missing default types. Idempotent — returns count inserted."""
    existing_keys = {
        k for (k,) in db.session.execute(db.select(InstrumentType.key)).all()
    }
    inserted = 0
    for key, label, order in DEFAULT_INSTRUMENT_TYPES:
        if key in existing_keys:
            continue
        db.session.add(InstrumentType(key=key, label=label, sort_order=order))
        inserted += 1
    if inserted:
        db.session.commit()
    return inserted
