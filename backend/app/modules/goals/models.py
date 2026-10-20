import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import IdMixin, OwnedMixin, TimestampMixin, utcnow
from app.extensions import db

GOAL_STATUSES = ("active", "paused", "completed", "abandoned")
GOAL_HORIZONS = ("short", "long")
PROGRESS_MODES = ("milestones", "tasks", "manual")
UPDATE_KINDS = ("auto", "manual", "note", "status")


class Goal(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """A measurable outcome. Progress is computed according to progress_mode (docs/01-database-schema.md §2.3)."""

    __tablename__ = "goals"
    __table_args__ = (
        CheckConstraint(f"status IN {GOAL_STATUSES}", name="status"),
        CheckConstraint(f"horizon IN {GOAL_HORIZONS}", name="horizon"),
        CheckConstraint(f"progress_mode IN {PROGRESS_MODES}", name="progress_mode"),
        CheckConstraint("manual_progress IS NULL OR manual_progress BETWEEN 0 AND 100", name="manual_progress"),
        CheckConstraint("target_date IS NULL OR start_date IS NULL OR target_date >= start_date", name="dates_order"),
        CheckConstraint("(status = 'completed') = (completed_at IS NOT NULL)", name="completed_has_completed_at"),
        Index("ix_goals_user_status", "user_id", "status"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    success_criteria: Mapped[str | None] = mapped_column(Text)  # what "done" means, in the user's words
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    horizon: Mapped[str] = mapped_column(String(10), nullable=False, default="short", server_default="short")
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="active", server_default="active")
    progress_mode: Mapped[str] = mapped_column(String(12), nullable=False, default="tasks", server_default="tasks")
    manual_progress: Mapped[int | None] = mapped_column(SmallInteger)
    start_date: Mapped[date | None] = mapped_column(Date)
    target_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    milestones: Mapped[list["GoalMilestone"]] = relationship(
        back_populates="goal", order_by="(GoalMilestone.position, GoalMilestone.created_at)"
    )


class GoalMilestone(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    __tablename__ = "goal_milestones"
    __table_args__ = (CheckConstraint("weight BETWEEN 1 AND 100", name="weight"),)

    # RESTRICT: milestones are history; goals are archived, never deleted.
    goal_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    weight: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=1, server_default="1")
    target_date: Mapped[date | None] = mapped_column(Date)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    goal: Mapped[Goal] = relationship(back_populates="milestones")


class GoalProgressUpdate(IdMixin, OwnedMixin, db.Model):
    """The goal's timeline. kind: auto (computed progress changed), manual (user set progress),
    note (free note), status (status changed)."""

    __tablename__ = "goal_progress_updates"
    __table_args__ = (
        CheckConstraint(f"kind IN {UPDATE_KINDS}", name="kind"),
        CheckConstraint("progress IS NULL OR progress BETWEEN 0 AND 100", name="progress"),
        Index("ix_goal_progress_updates_goal_created", "goal_id", "created_at"),
    )

    goal_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("goals.id", ondelete="RESTRICT"), nullable=False)
    kind: Mapped[str] = mapped_column(String(10), nullable=False)
    progress: Mapped[int | None] = mapped_column(SmallInteger)
    status: Mapped[str | None] = mapped_column(String(12))
    note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
