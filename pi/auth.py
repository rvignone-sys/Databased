"""Login/logout + Flask-Login user loader + role-aware decorator."""
from functools import wraps

import bcrypt
from flask import Blueprint, jsonify, request
from flask_login import LoginManager, login_user, logout_user, login_required, current_user

from .models import User, db


login_manager = LoginManager()
login_manager.login_view = None  # SPA handles redirects


def admin_required(view):
    """Wrap a Flask view: must be authenticated AND have role == 'admin'."""
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user.is_authenticated:
            return jsonify({"error": "unauthorized"}), 401
        if not getattr(current_user, "is_admin", False):
            return jsonify({"error": "admin role required"}), 403
        return view(*args, **kwargs)
    return wrapped


@login_manager.user_loader
def load_user(user_id: str):
    return db.session.get(User, int(user_id))


@login_manager.unauthorized_handler
def unauthorized():
    return jsonify({"error": "unauthorized"}), 401


bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    password = (data.get("password") or "").encode()
    if not username or not password:
        return jsonify({"error": "missing credentials"}), 400

    user = db.session.execute(
        db.select(User).where(User.username == username)
    ).scalar_one_or_none()

    if not user or not bcrypt.checkpw(password, user.password_hash.encode()):
        return jsonify({"error": "invalid credentials"}), 401

    login_user(user, remember=bool(data.get("remember")))
    return jsonify({
        "id": user.id, "username": user.username, "role": user.role, "theme": user.theme or "dark",
    })


@bp.post("/logout")
@login_required
def logout():
    logout_user()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    if not current_user.is_authenticated:
        return jsonify({"authenticated": False}), 200
    return jsonify({
        "authenticated": True,
        "id": current_user.id,
        "username": current_user.username,
        "role": current_user.role,
        "theme": current_user.theme or "dark",
    })


@bp.patch("/me")
@login_required
def update_me():
    """Self-service: update own preferences (theme only for now)."""
    data = request.get_json(silent=True) or {}
    if "theme" in data:
        if data["theme"] not in ("dark", "light"):
            return jsonify({"error": "theme must be 'dark' or 'light'"}), 400
        current_user.theme = data["theme"]
    db.session.commit()
    return jsonify({
        "id": current_user.id, "username": current_user.username,
        "role": current_user.role, "theme": current_user.theme or "dark",
    })
