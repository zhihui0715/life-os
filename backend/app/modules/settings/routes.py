from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Blueprint
from pydantic import Field, field_validator

from app.common.auth import current_user
from app.common.validation import InputModel, parse_body
from app.extensions import db
from app.modules.auth.models import UserSettings

bp = Blueprint("settings", __name__, url_prefix="/api/v1/settings")


def settings_to_dict(s: UserSettings) -> dict:
    return {"locale": s.locale, "timezone": s.timezone, "week_start": s.week_start, "theme": s.theme}


class SettingsPatch(InputModel):
    locale: Literal["en", "zh-CN"] | None = None
    timezone: str | None = Field(default=None, max_length=64)
    week_start: int | None = Field(default=None, ge=1, le=7)
    theme: Literal["system", "light", "dark"] | None = None

    @field_validator("timezone")
    @classmethod
    def valid_timezone(cls, v):
        if v is None:
            return v
        try:
            ZoneInfo(v)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValueError("Unknown timezone") from None
        return v


@bp.get("")
def get_settings():
    return settings_to_dict(current_user().settings)


@bp.patch("")
def update_settings():
    data = parse_body(SettingsPatch)
    s = current_user().settings
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(s, field, value)
    db.session.commit()
    return settings_to_dict(s)
