import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    SmallInteger,
    String,
    Uuid,
    true,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import IdMixin, TimestampMixin, utcnow
from app.extensions import db

LOCALES = ("en", "zh-CN")
THEMES = ("system", "light", "dark")
DEFAULT_TIMEZONE = "Asia/Kuala_Lumpur"
WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")
# Used for free-slot finding until the user sets their own hours in Settings.
DEFAULT_WORKING_HOURS = {
    **{d: [["09:00", "18:00"]] for d in WEEKDAYS[:5]},
    **{d: [["10:00", "16:00"]] for d in WEEKDAYS[5:]},
}


SCORE_COMPONENTS = ("tasks", "goals_learning", "habits", "wellbeing")
DEFAULT_SCORE_WEIGHTS = {
    "tasks": 30, "goals_learning": 25, "habits": 30, "wellbeing": 15,
    "enabled": {k: True for k in SCORE_COMPONENTS},
}
DASHBOARD_SECTIONS = ("focus", "schedule", "tasks", "habits", "mood", "balance", "goals", "learning")
# ~100 daily plans or ~40 weekly reviews; on Claude Opus 5.5 roughly US$2 at most.
DEFAULT_AI_MONTHLY_TOKENS = 300_000

DEFAULT_DASHBOARD = [{"key": k, "visible": True} for k in DASHBOARD_SECTIONS]


class User(IdMixin, TimestampMixin, db.Model):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=true())
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    settings: Mapped["UserSettings"] = relationship(back_populates="user", uselist=False)


class UserSettings(db.Model):
    """One row per user. More columns (working hours, score weights, AI) arrive in later stages."""

    __tablename__ = "user_settings"
    __table_args__ = (
        CheckConstraint(f"locale IN {LOCALES}", name="locale"),
        CheckConstraint(f"theme IN {THEMES}", name="theme"),
        CheckConstraint("week_start BETWEEN 1 AND 7", name="week_start"),
        CheckConstraint("ai_monthly_token_budget BETWEEN 0 AND 10000000", name="ai_budget"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    locale: Mapped[str] = mapped_column(String(10), nullable=False, default="en", server_default="en")
    timezone: Mapped[str] = mapped_column(
        String(64), nullable=False, default=DEFAULT_TIMEZONE, server_default=DEFAULT_TIMEZONE
    )
    week_start: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1, server_default="1")
    theme: Mapped[str] = mapped_column(String(10), nullable=False, default="system", server_default="system")
    # {"mon": [["09:00", "18:00"]], ...} in the user's timezone. NULL = use DEFAULT_WORKING_HOURS.
    working_hours: Mapped[dict | None] = mapped_column(JSONB)
    # Life Balance Score: {"tasks": 30, ..., "enabled": {"tasks": true, ...}}. NULL = DEFAULT_SCORE_WEIGHTS.
    score_weights: Mapped[dict | None] = mapped_column(JSONB)
    weekly_learning_target_min: Mapped[int | None] = mapped_column(Integer)  # NULL = no target set
    # Home sections in order: [{"key": "tasks", "visible": true}, ...]. NULL = DEFAULT_DASHBOARD.
    dashboard_layout: Mapped[list | None] = mapped_column(JSONB)
    # AI assistance is opt-in, and capped per calendar month (input + output tokens).
    ai_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    ai_monthly_token_budget: Mapped[int] = mapped_column(
        Integer, nullable=False, default=DEFAULT_AI_MONTHLY_TOKENS, server_default=str(DEFAULT_AI_MONTHLY_TOKENS)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="settings")


class AuthSession(db.Model):
    """Server-side login session. The browser cookie holds a random token; we store only its SHA-256 hash,
    so a database leak does not reveal usable session tokens. Logging out deletes the row (real revocation)."""

    __tablename__ = "auth_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # sha256(token) hex
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    csrf_token: Mapped[str] = mapped_column(String(64), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    user: Mapped[User] = relationship()
