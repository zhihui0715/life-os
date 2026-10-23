"""App factory. Beginner note: building the app inside a function (instead of at import time) lets tests
create a fresh app with test settings, and lets one codebase run in development, testing and production."""

import logging
import time
import uuid

from flask import Blueprint, Flask, g, request
from sqlalchemy import text

from app.common.auth import load_and_enforce_auth
from app.common.errors import register_error_handlers
from app.common.idempotency import remember, replay_if_seen
from app.config import check_config, get_config
from app.extensions import db, limiter, migrate

log = logging.getLogger("lifeos.request")

health_bp = Blueprint("health", __name__)


@health_bp.get("/api/v1/health")
def health():
    db.session.execute(text("SELECT 1"))
    return {"status": "ok"}


def create_app(config_name: str | None = None) -> Flask:
    app = Flask(__name__)
    app.config.from_object(get_config(config_name))
    check_config(app)
    app.json.sort_keys = False
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

    db.init_app(app)
    migrate.init_app(app, db, directory=str(_migrations_dir()))
    limiter.init_app(app)

    from app import models  # noqa: F401  (registers every table for Alembic)
    from app.modules.activity.routes import activity_bp, focus_bp
    from app.modules.ai.routes import bp as ai_bp
    from app.modules.auth.routes import bp as auth_bp
    from app.modules.backup.routes import bp as backup_bp
    from app.modules.calendar.routes import bp as calendar_bp
    from app.modules.categories.routes import bp as categories_bp
    from app.modules.goals.routes import bp as goals_bp
    from app.modules.habits.routes import bp as habits_bp
    from app.modules.insights.routes import bp as insights_bp
    from app.modules.journal.routes import bp as journal_bp
    from app.modules.settings.routes import bp as settings_bp
    from app.modules.tasks.routes import bp as tasks_bp
    from app.modules.tasks.routes import tags_bp

    for bp in (health_bp, auth_bp, settings_bp, categories_bp, tasks_bp, tags_bp, goals_bp, calendar_bp, habits_bp, journal_bp, activity_bp, focus_bp, insights_bp, backup_bp, ai_bp):
        app.register_blueprint(bp)

    register_error_handlers(app)

    @app.before_request
    def _start_request():
        g.request_id = uuid.uuid4().hex[:12]
        g.started = time.perf_counter()

    app.before_request(load_and_enforce_auth)
    app.before_request(replay_if_seen)  # after auth: keys belong to a user

    app.after_request(remember)

    @app.after_request
    def _finish_request(response):
        response.headers["X-Request-ID"] = g.get("request_id", "")
        # Log the shape of the request only — never bodies (journal text etc.).
        duration_ms = (time.perf_counter() - g.get("started", time.perf_counter())) * 1000
        log.info("%s %s %s %.0fms id=%s", request.method, request.path, response.status_code, duration_ms, g.get("request_id"))
        return response

    from app.web import init_web

    init_web(app)  # security headers; in production also serves the built frontend

    from app.cli import register_cli

    register_cli(app)
    return app


def _migrations_dir():
    from pathlib import Path

    return Path(__file__).resolve().parent.parent / "migrations"
