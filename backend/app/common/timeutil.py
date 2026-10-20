"""All "what day is it for the user?" logic lives here (see docs/01-database-schema.md, time rules)."""

from datetime import date, datetime
from zoneinfo import ZoneInfo

from app.common.models import utcnow


def user_zone(user) -> ZoneInfo:
    return ZoneInfo(user.settings.timezone)


def user_today(user, now: datetime | None = None) -> date:
    return (now or utcnow()).astimezone(user_zone(user)).date()
