"""User management — admin only.

Two roles supported: 'admin' (full control) and 'user' (view + RDP).
"""
import bcrypt
from flask import Blueprint, jsonify, request
from flask_login import current_user

from ..models import User, db
from ..auth import admin_required


bp = Blueprint("users", __name__, url_prefix="/api/users")


VALID_ROLES = {"admin", "user"}


@bp.get("")
@admin_required
def list_users():
    rows = db.session.execute(db.select(User).order_by(User.username)).scalars().all()
    return jsonify([u.to_dict() for u in rows])


@bp.post("")
@admin_required
def create_user():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = data.get("password") or ""
    role = (data.get("role") or "user").strip()
    if not username or not password:
        return jsonify({"error": "username and password required"}), 400
    if role not in VALID_ROLES:
        return jsonify({"error": f"role must be one of {sorted(VALID_ROLES)}"}), 400
    if db.session.execute(db.select(User).where(User.username == username)).scalar_one_or_none():
        return jsonify({"error": "username already exists"}), 409
    u = User(
        username=username,
        password_hash=bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode(),
        role=role,
    )
    db.session.add(u)
    db.session.commit()
    return jsonify(u.to_dict()), 201


@bp.patch("/<int:user_id>")
@admin_required
def update_user(user_id: int):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify({"error": "not found"}), 404
    data = request.get_json(silent=True) or {}
    if "username" in data:
        u.username = (data["username"] or "").strip()
    if "role" in data:
        if data["role"] not in VALID_ROLES:
            return jsonify({"error": "invalid role"}), 400
        # Refuse to demote the only admin.
        if u.role == "admin" and data["role"] != "admin":
            admin_count = db.session.execute(
                db.select(db.func.count()).select_from(User).where(User.role == "admin")
            ).scalar()
            if admin_count <= 1:
                return jsonify({"error": "cannot demote the last admin"}), 400
        u.role = data["role"]
    if data.get("password"):
        u.password_hash = bcrypt.hashpw(data["password"].encode(), bcrypt.gensalt()).decode()
    db.session.commit()
    return jsonify(u.to_dict())


@bp.delete("/<int:user_id>")
@admin_required
def delete_user(user_id: int):
    u = db.session.get(User, user_id)
    if not u:
        return jsonify({"error": "not found"}), 404
    if u.id == current_user.id:
        return jsonify({"error": "cannot delete yourself"}), 400
    if u.role == "admin":
        admin_count = db.session.execute(
            db.select(db.func.count()).select_from(User).where(User.role == "admin")
        ).scalar()
        if admin_count <= 1:
            return jsonify({"error": "cannot delete the last admin"}), 400
    db.session.delete(u)
    db.session.commit()
    return jsonify({"ok": True})
