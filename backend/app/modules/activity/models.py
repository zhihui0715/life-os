import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db

FOCUS_STATES = ("running", "paused", "completed", "interrupted")


class ActivityLog(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """Time you spent on something: learning, work, exercise… Only ever created by you (directly or by stopping a
    focus session) — nothing is recorded automatically. Learning time = logs in a category of kind "learning"."""

    __tablename__ = "activity_logs"
    __table_args__ = (
        CheckConstraint("duration_minutes > 0 AND duration_minutes <= 1440", name="duration_range"),
        CheckConstraint("ended_at IS NULL OR started_at IS NULL OR ended_at > started_at", name="time_order"),
        Index("ix_activity_logs_user_date", "user_id", "log_date"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="SET NULL"))
    log_date: Mapped[date] = mapped_column(Date, nullable=False)  # local day
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    outcome: Mapped[str | None] = mapped_column(Text)
    goal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("goals.id", ondelete="SET NULL"), index=True)
    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("tasks.id", ondelete="SET NULL"), index=True)
    # Set when the log was created from a focus session, so the same minutes are never counted twice.
    focus_session_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("focus_sessions.id", ondelete="SET NULL"), unique=True
    )


class FocusSession(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """A timed focus block. The server keeps the clock, so a refresh or switching devices doesn't lose it."""

    __tablename__ = "focus_sessions"
    __table_args__ = (
        CheckConstraint(f"state IN {FOCUS_STATES}", name="state"),
        CheckConstraint("planned_minutes BETWEEN 1 AND 240", name="planned_range"),
        CheckConstraint("paused_seconds >= 0", name="paused_non_negative"),
        CheckConstraint("(state IN ('running', 'paused')) = (ended_at IS NULL)", name="open_has_no_end"),
        CheckConstraint("(state = 'paused') = (paused_at IS NOT NULL)", name="paused_has_paused_at"),
        Index("ix_focus_sessions_user_started", "user_id", "started_at"),
    )

    task_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("tasks.id", ondelete="SET NULL"), index=True)
    label: Mapped[str | None] = mapped_column(String(200))  # what you're focusing on, if not a task
    planned_minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    break_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=5, server_default="5")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_seconds: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    actual_minutes: Mapped[int | None] = mapped_column(Integer)  # set on stop; you can correct it
    state: Mapped[str] = mapped_column(String(12), nullable=False, default="running", server_default="running")
