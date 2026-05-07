"""Flask app factory and dev entrypoint."""
import os
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, jsonify, send_from_directory


REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(REPO_ROOT / ".env")

from .models import db  # noqa: E402  imported after dotenv
from .auth import bp as auth_bp, login_manager  # noqa: E402
from .api.agent import bp as agent_bp  # noqa: E402
from .api.computers import bp as computers_bp  # noqa: E402
from .api.jobs import bp as jobs_bp  # noqa: E402
from .api.logs import bp as logs_bp  # noqa: E402
from .api.settings import bp as settings_bp  # noqa: E402
from .api.users import bp as users_bp  # noqa: E402
from .api.instrument_types import bp as instrument_types_bp  # noqa: E402
from .api.repo import bp as repo_bp  # noqa: E402
from . import scheduler  # noqa: E402
from .host_metrics import host as host_metrics  # noqa: E402


def create_app() -> Flask:
    web_dist = REPO_ROOT / "web" / "dist"
    web_public_games = REPO_ROOT / "web" / "public" / "games"
    app = Flask(__name__, static_folder=str(web_dist) if web_dist.exists() else None, static_url_path="")

    app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "dev-only-change-me")
    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ.get("DATABASE_URL", f"sqlite:///{REPO_ROOT}/pi/data/databased.db")
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
    app.config["HEARTBEAT_TIMEOUT"] = int(os.environ.get("HEARTBEAT_TIMEOUT", "120"))

    db.init_app(app)
    login_manager.init_app(app)

    app.register_blueprint(auth_bp)
    app.register_blueprint(agent_bp)
    app.register_blueprint(computers_bp)
    app.register_blueprint(jobs_bp)
    app.register_blueprint(logs_bp)
    app.register_blueprint(settings_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(instrument_types_bp)
    app.register_blueprint(repo_bp)

    # Convenient favicon URL — same content as the lab logo.
    @app.get("/favicon.ico")
    def favicon():
        from .models import LabSettings
        s = db.session.get(LabSettings, 1)
        if s and s.logo_filename:
            from flask import redirect
            return redirect("/api/settings/logo", code=302)
        # No custom logo set — let browser use default
        return ("", 204)

    @app.get("/api/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/api/host/metrics")
    def get_host_metrics():
        from flask_login import current_user
        if not current_user.is_authenticated:
            return jsonify({"error": "unauthorized"}), 401
        return jsonify({"latest": host_metrics.latest(), "history": host_metrics.history()})

    # Live-serve games from web/public/games/ so editors don't need to rebuild
    # after dropping in a new HTML file. Registered before the SPA fallback so
    # this wins over the dist/games/ copy.
    @app.get("/games/<path:filename>")
    def games(filename: str):
        if not web_public_games.exists():
            return jsonify({"error": "games folder missing"}), 404
        # send_from_directory rejects "../" traversal automatically.
        return send_from_directory(
            str(web_public_games), filename,
            max_age=0,  # disable caching so edit→refresh just works
        )

    # SPA fallback: serve index.html for any non-API route once `web/dist` exists.
    @app.route("/", defaults={"path": ""})
    @app.route("/<path:path>")
    def spa(path: str):
        if web_dist.exists():
            target = web_dist / path
            if path and target.exists():
                return send_from_directory(str(web_dist), path)
            return send_from_directory(str(web_dist), "index.html")
        return jsonify({"message": "DataBased API. Web bundle not built yet — run `npm run dev` in web/."}), 200

    return app


if __name__ == "__main__":
    app = create_app()
    # Werkzeug reloader runs the app twice; only start the scheduler in the inner process.
    if os.environ.get("WERKZEUG_RUN_MAIN") == "true" or not app.debug:
        scheduler.start(app)
        host_metrics.start()
    app.run(host="0.0.0.0", port=5000, debug=True)
