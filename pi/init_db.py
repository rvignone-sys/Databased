"""Create tables and seed the admin user from .env. Idempotent — safe to re-run."""
import os
import sys
import bcrypt
from sqlalchemy import inspect, text

from .app import create_app
from .models import User, db, get_settings, seed_instrument_types


# Columns added after the initial schema. SQLite has no `ADD COLUMN IF NOT EXISTS`,
# so we introspect and ALTER only when missing.
ADD_COLUMNS = {
    "instrument_types": [
        ("svg", "TEXT"),
        ("lucide_name", "VARCHAR(64)"),
    ],
    "lab_settings": [
        ("central_build_path", "VARCHAR(512)"),
        ("central_build_path_pi", "VARCHAR(512)"),
        ("last_pushed_at", "DATETIME"),
        ("dashboard_heading", "VARCHAR(128)"),
    ],
    "computers": [
        ("metrics_interval", "INTEGER"),
        ("heartbeat_interval", "INTEGER"),
        ("poll_interval", "INTEGER"),
        ("is_file_server", "BOOLEAN"),
        ("monitored_disk_mounts", "TEXT"),
        ("agent_id", "VARCHAR(36)"),
        ("category", "VARCHAR(64)"),
        ("remote_protocol", "VARCHAR(8)"),
        ("watch_processes", "VARCHAR(512)"),
        ("update_source_path", "VARCHAR(512)"),
        ("update_requested_at", "DATETIME"),
        ("internet_enabled", "BOOLEAN"),
        ("internet_enabled_at", "DATETIME"),
        ("device_kind", "VARCHAR(16)"),
    ],
    "users": [
        ("role", "VARCHAR(16)"),
        ("theme", "VARCHAR(8)"),
    ],
    "sync_logs": [
        ("file_list", "TEXT"),
        ("files_ignored", "INTEGER"),
    ],
    "sync_jobs": [
        ("exclude_patterns", "VARCHAR(512)"),
        ("analyze_status", "VARCHAR(16)"),
        ("analyze_file_count", "INTEGER"),
        ("analyze_total_bytes", "BIGINT"),
        ("analyze_largest_file", "VARCHAR(512)"),
        ("analyze_largest_file_bytes", "BIGINT"),
        ("analyze_extensions", "TEXT"),
        ("analyze_truncated", "BOOLEAN"),
        ("analyze_error", "TEXT"),
        ("analyze_at", "DATETIME"),
    ],
}


def _add_missing_columns() -> None:
    inspector = inspect(db.engine)
    for table, cols in ADD_COLUMNS.items():
        if table not in inspector.get_table_names():
            continue  # create_all() will handle it on first run
        existing = {c["name"] for c in inspector.get_columns(table)}
        for name, ddl in cols:
            if name not in existing:
                with db.engine.begin() as conn:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
                print(f"Added column: {table}.{name}")


def _ensure_indexes() -> None:
    """Create unique index for agent_id when missing (ALTER TABLE on SQLite
    can't add constraints, so we do it as a partial unique index — partial so
    legacy NULL rows don't all collide on each other)."""
    with db.engine.begin() as conn:
        conn.execute(text(
            "CREATE UNIQUE INDEX IF NOT EXISTS ix_computers_agent_id "
            "ON computers(agent_id) WHERE agent_id IS NOT NULL"
        ))


def main() -> int:
    app = create_app()
    with app.app_context():
        db.create_all()
        _add_missing_columns()
        _ensure_indexes()
        # Backfill role on pre-existing user rows (column defaults to NULL after ALTER).
        with db.engine.begin() as conn:
            conn.execute(text("UPDATE users SET role = 'admin' WHERE role IS NULL"))
        # Backfill device_kind: existing rows get a sensible guess from
        # icon_type/is_file_server. New rows take the column default ('pc').
        with db.engine.begin() as conn:
            conn.execute(text(
                "UPDATE computers SET device_kind = "
                "CASE "
                "  WHEN is_file_server = 1 THEN 'server' "
                "  WHEN icon_type = 'computer' THEN 'pc' "
                "  ELSE 'instrument' "
                "END "
                "WHERE device_kind IS NULL"))
        get_settings()  # ensure singleton row exists
        n = seed_instrument_types()
        if n:
            print(f"Seeded {n} default instrument type(s).")

        username = os.environ.get("ADMIN_USERNAME", "admin").strip()
        password = os.environ.get("ADMIN_PASSWORD", "").strip()

        if not password:
            print("ERROR: ADMIN_PASSWORD not set in .env", file=sys.stderr)
            return 1

        existing = db.session.execute(
            db.select(User).where(User.username == username)
        ).scalar_one_or_none()

        if existing:
            print(f"Admin user '{username}' already exists. Updating password.")
            existing.password_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()
        else:
            user = User(
                username=username,
                password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
            )
            db.session.add(user)
            print(f"Created admin user '{username}'.")

        db.session.commit()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
