import uuid
from datetime import date, datetime

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Numeric,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db

SCHEDULE_TYPES = ("daily", "weekdays", "x_per_week")
LOG_STATES = ("done", "skipped")
ALL_DAYS_MASK = 127  # bits: Mon=1, Tue=2, Wed=4, Thu=8, Fri=16, Sat=32, Sun=64


class Habit(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """A repeated behaviour. Its schedule history lives in habit_schedule_changes, so changing the schedule never
    rewrites how past days are judged."""

    __tablename__ = "habits"

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    category_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("categories.id", ondelete="SET NULL"))
    goal_id: Mapped[uuid.UUID | None] = mapped_column(Uuid, ForeignKey("goals.id", ondelete="SET NULL"), index=True)
    target_value: Mapped[float | None] = mapped_column(Numeric(10, 2))  # optional amount per check-in, e.g. 20
    target_unit: Mapped[str | None] = mapped_column(String(20))  # e.g. "pages"
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    schedules: Mapped[list["HabitScheduleChange"]] = relationship(
        back_populates="habit", order_by="HabitScheduleChange.effective_from", cascade="all, delete-orphan", lazy="selectin"
    )


class HabitScheduleChange(IdMixin, db.Model):
    """The schedule that applies from `effective_from` until the next change."""

    __tablename__ = "habit_schedule_changes"
    __table_args__ = (
        UniqueConstraint("habit_id", "effective_from", name="uq_habit_schedule_changes_habit_from"),
        CheckConstraint(f"schedule_type IN {SCHEDULE_TYPES}", name="schedule_type"),
        CheckConstraint("weekday_mask BETWEEN 1 AND 127", name="weekday_mask"),
        CheckConstraint("times_per_week BETWEEN 1 AND 7", name="times_per_week"),
    )

    # CASCADE: a schedule row means nothing without its habit.
    habit_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("habits.id", ondelete="CASCADE"), nullable=False, index=True)
    effective_from: Mapped[date] = mapped_column(Date, nullable=False)
    schedule_type: Mapped[str] = mapped_column(String(12), nullable=False)
    weekday_mask: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=ALL_DAYS_MASK)
    times_per_week: Mapped[int] = mapped_column(SmallInteger, nullable=False, default=7)

    habit: Mapped[Habit] = relationship(back_populates="schedules")


class HabitLog(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """One check-in. "missed" is never stored: it's a scheduled past day with no log, so corrections are trivial."""

    __tablename__ = "habit_logs"
    __table_args__ = (
        UniqueConstraint("habit_id", "log_date", name="uq_habit_logs_habit_date"),
        CheckConstraint(f"state IN {LOG_STATES}", name="state"),
    )

    # RESTRICT: logs are history; habits are archived, not deleted.
    habit_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("habits.id", ondelete="RESTRICT"), nullable=False, index=True)
    log_date: Mapped[date] = mapped_column(Date, nullable=False)
    state: Mapped[str] = mapped_column(String(8), nullable=False)
    value: Mapped[float | None] = mapped_column(Numeric(10, 2))
    note: Mapped[str | None] = mapped_column(Text)
