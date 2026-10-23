from datetime import datetime

from sqlalchemy import CheckConstraint, DateTime, Index, Integer, String
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import IdMixin, OwnedMixin, utcnow
from app.extensions import db

AI_KINDS = ("daily_plan", "weekly_review")
AI_RUN_STATUSES = ("ok", "error")


class AiRun(IdMixin, OwnedMixin, db.Model):
    """One request to the AI provider: what kind, which data categories were sent, what it cost, what came back.
    The prompt itself is never stored — it may contain journal text."""

    __tablename__ = "ai_runs"
    __table_args__ = (
        CheckConstraint(f"kind IN {AI_KINDS}", name="kind"),
        CheckConstraint(f"status IN {AI_RUN_STATUSES}", name="status"),
        Index("ix_ai_runs_user_created", "user_id", "created_at"),
    )

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    data_categories_sent: Mapped[list] = mapped_column(JSONB, nullable=False)
    provider: Mapped[str] = mapped_column(String(30), nullable=False)
    model: Mapped[str] = mapped_column(String(80), nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    status: Mapped[str] = mapped_column(String(8), nullable=False)
    error_code: Mapped[str | None] = mapped_column(String(40))
    response: Mapped[dict | None] = mapped_column(JSONB)  # the validated proposal, as shown to you
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
