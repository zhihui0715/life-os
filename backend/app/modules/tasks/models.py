import uuid
from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, SmallInteger, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db

TASK_STATUSES = ("inbox", "todo", "in_progress", "done")


class Task(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """A unit of work. Deadline vs due date vs scheduled time: see docs/01-database-schema.md §2.4.
    goal_id / milestone_id / parent_task_id arrive in the Stage 2 migration."""

    __tablename__ = "tasks"
    __table_args__ = (
        CheckConstraint(f"status IN {TASK_STATUSES}", name="status"),
        CheckConstraint("priority BETWEEN 1 AND 4", name="priority"),
        CheckConstraint("estimate_minutes IS NULL OR estimate_minutes >= 0", name="estimate_non_negative"),
        CheckConstraint(
            "actual_minutes_manual IS NULL OR actual_minutes_manual >= 0", name="actual_non_negative"
        ),
        # A task is "done" exactly when it has a completion time — the two can never disagree.
        CheckConstraint("(status = 'done') = (completed_at IS NOT NULL)", name="done_has_completed_at"),
        Index("ix_tasks_user_status_due", "user_id", "status", "due_date"),
    )

    title: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(12), nullable=False, default="inbox", server_default="inbox")
    priority: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=3, server_default="3")
    due_date: Mapped[date | None] = mapped_column(Date)  # soft target day (user's local calendar)
    deadline: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # hard, exact instant
    estimate_minutes: Mapped[int | None] = mapped_column(Integer)
    actual_minutes_manual: Mapped[int | None] = mapped_column(Integer)  # user override of tracked time
    category_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid, ForeignKey("categories.id", ondelete="SET NULL"), index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
