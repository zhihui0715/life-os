import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.common.models import IdMixin, OwnedMixin, TimestampMixin
from app.extensions import db


class PushSubscription(IdMixin, OwnedMixin, TimestampMixin, db.Model):
    """One device that gets reminders even when Life OS is closed (Web Push). The endpoint and keys come from the
    browser; prefs are that device's reminder settings (the same ones the app uses while it's open). Device-specific,
    so it's never part of a backup."""

    __tablename__ = "push_subscriptions"

    endpoint: Mapped[str] = mapped_column(Text, nullable=False, unique=True)
    p256dh: Mapped[str] = mapped_column(String(200), nullable=False)
    auth: Mapped[str] = mapped_column(String(100), nullable=False)
    prefs: Mapped[dict] = mapped_column(JSONB, nullable=False)
    last_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PushSent(db.Model):
    """A reminder already sent to a device, so each is sent once. Rows older than a few days are cleared."""

    __tablename__ = "push_sent"

    subscription_id: Mapped[uuid.UUID] = mapped_column(
        Uuid, ForeignKey("push_subscriptions.id", ondelete="CASCADE"), primary_key=True
    )
    key: Mapped[str] = mapped_column(String(160), primary_key=True)
    sent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
