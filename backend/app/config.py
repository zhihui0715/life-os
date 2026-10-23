"""Configuration per environment. All secrets come from environment variables (.env locally)."""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

REPO_ROOT = Path(__file__).resolve().parents[2]
load_dotenv(REPO_ROOT / ".env")


def _db_url(url: str | None) -> str | None:
    """Hosts often hand out postgres://… addresses; SQLAlchemy needs the driver named (postgresql+psycopg://…)."""
    if url and url.startswith(("postgres://", "postgresql://")):
        return "postgresql+psycopg://" + url.split("://", 1)[1]
    return url


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY")
    SQLALCHEMY_DATABASE_URI = _db_url(os.environ.get("DATABASE_URL"))
    # pool_pre_ping: recover from dropped DB connections.
    # timezone=utc: the DB returns every timestamptz in UTC, whatever the server's local zone.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "pool_pre_ping": True,
        "connect_args": {"options": "-c timezone=utc"},
    }

    SESSION_COOKIE_NAME = "lifeos_session"
    SESSION_COOKIE_HTTPONLY = True  # JavaScript cannot read the cookie
    SESSION_COOKIE_SAMESITE = "Lax"  # not sent on cross-site POSTs
    SESSION_COOKIE_SECURE = False  # True in production (HTTPS only)
    PERMANENT_SESSION_LIFETIME = timedelta(days=14)

    MAX_CONTENT_LENGTH = 1 * 1024 * 1024  # 1 MB request bodies

    # Production container: path of the built frontend to serve (frontend/dist); unset in development (Vite serves it).
    FRONTEND_DIST = os.environ.get("FRONTEND_DIST") or None
    # True when running behind the host's HTTPS proxy (it sets X-Forwarded-For / X-Forwarded-Proto).
    TRUST_PROXY = os.environ.get("TRUST_PROXY", "").lower() in ("1", "true", "yes")

    RATELIMIT_ENABLED = True
    RATELIMIT_STORAGE_URI = "memory://"
    RATELIMIT_HEADERS_ENABLED = True


class DevelopmentConfig(Config):
    ENV_NAME = "development"
    DEBUG = True


class TestingConfig(Config):
    ENV_NAME = "testing"
    TESTING = True
    SQLALCHEMY_DATABASE_URI = os.environ.get("TEST_DATABASE_URL")
    SECRET_KEY = "test-secret-key"
    RATELIMIT_ENABLED = False


class ProductionConfig(Config):
    ENV_NAME = "production"
    SESSION_COOKIE_SECURE = True


CONFIGS = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def get_config(name: str | None):
    name = name or os.environ.get("APP_ENV", "development")
    if name not in CONFIGS:
        raise RuntimeError(f"Unknown APP_ENV '{name}'. Use one of: {', '.join(CONFIGS)}")
    return CONFIGS[name]


def check_config(app) -> None:
    """Fail fast on missing or unsafe settings instead of failing later in odd ways."""
    if not app.config.get("SQLALCHEMY_DATABASE_URI"):
        raise RuntimeError("DATABASE_URL (or TEST_DATABASE_URL for tests) is not set. See .env.example.")
    secret = app.config.get("SECRET_KEY")
    if not secret or (not app.testing and (secret.startswith("change-me") or len(secret) < 32)):
        raise RuntimeError("SECRET_KEY is missing or too weak. See .env.example for how to generate one.")
