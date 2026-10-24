import re
from datetime import time
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from flask import Blueprint
from pydantic import Field, field_validator

from app.common.auth import current_user
from app.common.validation import InputModel, parse_body
from app.extensions import db
from app.modules.auth.models import (
    ACCENTS,
    BACKGROUNDS,
    DASHBOARD_SECTIONS,
    DEFAULT_DASHBOARD,
    DEFAULT_SCORE_WEIGHTS,
    DEFAULT_WORKING_HOURS,
    SCORE_COMPONENTS,
    WEEKDAYS,
    UserSettings,
)

bp = Blueprint("settings", __name__, url_prefix="/api/v1/settings")

REPORT_KINDS = ("day", "week", "month")  # app/modules/reports
BOOK_AVATAR = re.compile(r"book-[1-8]")  # the drawn book characters (frontend/src/components/ui/BookAvatar.tsx)


def settings_to_dict(s: UserSettings) -> dict:
    return {
        "locale": s.locale,
        "timezone": s.timezone,
        "week_start": s.week_start,
        "theme": s.theme,
        "accent": s.accent,
        "background": s.background,
        "avatar": s.avatar,
        "working_hours": s.working_hours or DEFAULT_WORKING_HOURS,
        "score_weights": s.score_weights or DEFAULT_SCORE_WEIGHTS,
        "weekly_learning_target_min": s.weekly_learning_target_min,
        "dashboard_layout": dashboard_layout(s),
        "report_emails": {k: bool((s.report_emails or {}).get(k)) for k in REPORT_KINDS},
    }


def dashboard_layout(s: UserSettings) -> list:
    """Stored order, plus any sections added in later versions (appended, visible)."""
    stored = [x for x in (s.dashboard_layout or []) if x.get("key") in DASHBOARD_SECTIONS]
    known = {x["key"] for x in stored}
    return stored + [x for x in DEFAULT_DASHBOARD if x["key"] not in known] if stored else list(DEFAULT_DASHBOARD)


def _valid_weights(v: dict) -> dict:
    enabled = v.get("enabled", {})
    if set(v) - {*SCORE_COMPONENTS, "enabled"} or not isinstance(enabled, dict) or set(enabled) - set(SCORE_COMPONENTS):
        raise ValueError("Unknown score component")
    out = {"enabled": {}}
    for k in SCORE_COMPONENTS:
        w = v.get(k, DEFAULT_SCORE_WEIGHTS[k])
        if not isinstance(w, int) or isinstance(w, bool) or not 0 <= w <= 100:
            raise ValueError("Weights are whole numbers from 0 to 100")
        out[k] = w
        on = enabled.get(k, True)
        if not isinstance(on, bool):
            raise ValueError("enabled values must be true or false")
        out["enabled"][k] = on
    if not any(out["enabled"][k] and out[k] > 0 for k in SCORE_COMPONENTS):
        raise ValueError("Keep at least one component enabled with a weight above 0")
    return out


def _valid_layout(v: list) -> list:
    if not isinstance(v, list):
        raise ValueError("Layout must be a list")
    seen, out = set(), []
    for item in v:
        if not isinstance(item, dict) or item.get("key") not in DASHBOARD_SECTIONS or not isinstance(item.get("visible"), bool):
            raise ValueError("Each section is {key, visible}")
        if item["key"] in seen:
            raise ValueError("Duplicate section")
        seen.add(item["key"])
        out.append({"key": item["key"], "visible": item["visible"]})
    return out


def _valid_working_hours(v: dict) -> dict:
    """{"mon": [["09:00", "12:00"], ["13:00", "18:00"]], ...}: up to 3 non-overlapping ranges per day."""
    if set(v) - set(WEEKDAYS):
        raise ValueError("Unknown weekday")
    out = {}
    for day in WEEKDAYS:
        ranges = v.get(day, [])
        if not isinstance(ranges, list) or len(ranges) > 3:
            raise ValueError("Each day takes up to 3 time ranges")
        cleaned = []
        for r in ranges:
            if not (isinstance(r, list) and len(r) == 2 and all(isinstance(x, str) for x in r)):
                raise ValueError("A range is [\"HH:MM\", \"HH:MM\"]")
            try:
                start, end = time.fromisoformat(r[0]), time.fromisoformat(r[1])
            except ValueError:
                raise ValueError("Times must be HH:MM") from None
            if end <= start:
                raise ValueError("A range must end after it starts")
            cleaned.append((start, end))
        cleaned.sort()
        if any(b[0] < a[1] for a, b in zip(cleaned, cleaned[1:])):
            raise ValueError("Ranges on the same day must not overlap")
        out[day] = [[s.strftime("%H:%M"), e.strftime("%H:%M")] for s, e in cleaned]
    return out


class SettingsPatch(InputModel):
    locale: Literal["en", "zh-CN"] | None = None
    timezone: str | None = Field(default=None, max_length=64)
    week_start: int | None = Field(default=None, ge=1, le=7)
    theme: Literal["system", "light", "dark", "academia"] | None = None
    accent: str | None = None
    background: str | None = None
    avatar: str | None = Field(default=None, max_length=16)
    working_hours: dict | None = None
    score_weights: dict | None = None
    weekly_learning_target_min: int | None = Field(default=None, ge=0, le=10_080)
    dashboard_layout: list | None = None
    report_emails: dict | None = None

    @field_validator("report_emails")
    @classmethod
    def valid_report_emails(cls, v):
        if v is not None and (set(v) - set(REPORT_KINDS) or any(not isinstance(x, bool) for x in v.values())):
            raise ValueError("report_emails takes day, week and month, each true or false")
        return v

    @field_validator("accent")
    @classmethod
    def valid_accent(cls, v):
        if v is not None and v not in ACCENTS:
            raise ValueError(f"accent must be one of {', '.join(ACCENTS)}")
        return v

    @field_validator("background")
    @classmethod
    def valid_background(cls, v):
        if v is not None and v not in BACKGROUNDS:
            raise ValueError("unknown background")
        return v

    @field_validator("avatar")
    @classmethod
    def valid_avatar(cls, v):
        """One of the drawn book characters ("book-1" … "book-8"); "" clears it."""
        if v is None:
            return v
        v = v.strip()
        if v and not BOOK_AVATAR.fullmatch(v):
            raise ValueError("avatar must be one of the book characters")
        return v or None

    @field_validator("score_weights")
    @classmethod
    def valid_weights(cls, v):
        return None if v is None else _valid_weights(v)

    @field_validator("dashboard_layout")
    @classmethod
    def valid_layout(cls, v):
        return None if v is None else _valid_layout(v)

    @field_validator("working_hours")
    @classmethod
    def valid_hours(cls, v):
        return None if v is None else _valid_working_hours(v)

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
    changes = data.model_dump(exclude_unset=True)
    for field, value in changes.items():
        # weekly_learning_target_min (null or 0) and avatar ("" or null) can be cleared; other fields ignore null
        if value is None and field not in ("weekly_learning_target_min", "avatar"):
            continue
        if field == "weekly_learning_target_min" and value == 0:
            value = None
        if field == "report_emails":
            value = {**(s.report_emails or {}), **value}
        setattr(s, field, value)
    db.session.commit()
    return settings_to_dict(s)
