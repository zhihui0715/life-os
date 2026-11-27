"""Reminders when Life OS is closed (Web Push).

GET    /api/v1/push/config         is push set up on this server, and its public key
POST   /api/v1/push/subscriptions  this device starts (or updates) getting reminders
DELETE /api/v1/push/subscriptions  this device stops
POST   /api/v1/push/test           send a test reminder to this device
POST   /api/v1/push/tick           the outside scheduler's call (Authorization: Bearer PUSH_CRON_SECRET)
"""

import hmac
import re

from flask import Blueprint, current_app, request
from pydantic import Field, field_validator
from sqlalchemy import select

from app.common.auth import current_user
from app.common.errors import ApiError
from app.common.validation import InputModel, parse_body
from app.extensions import db, limiter
from app.modules.push import service
from app.modules.push.models import PushSubscription

bp = Blueprint("push", __name__, url_prefix="/api/v1/push")

HHMM = re.compile(r"^(?:[01]\d|2[0-3]):[0-5]\d$")


class Prefs(InputModel):
    """The device's reminder settings (lib/reminders.ts ReminderPrefs)."""

    model_config = {**InputModel.model_config, "extra": "ignore"}  # "enabled" etc. stay on the device

    eventLead: int = Field(default=10, ge=0, le=120)
    deadlines: bool = True
    habitsAt: str = "20:00"
    planAt: str = "08:30"
    reviewAt: str = "18:00"

    @field_validator("habitsAt", "planAt", "reviewAt")
    @classmethod
    def time_or_off(cls, v):
        if v and not HHMM.match(v):
            raise ValueError("Use HH:MM, or an empty string for off")
        return v


class Keys(InputModel):
    p256dh: str = Field(min_length=1, max_length=200)
    auth: str = Field(min_length=1, max_length=100)


class SubscriptionIn(InputModel):
    endpoint: str = Field(min_length=1, max_length=2000)
    keys: Keys
    prefs: Prefs = Field(default_factory=Prefs)

    @field_validator("endpoint")
    @classmethod
    def https_only(cls, v):
        if not v.startswith("https://"):
            raise ValueError("A push endpoint is an https address")
        return v


class EndpointIn(InputModel):
    endpoint: str = Field(min_length=1, max_length=2000)


def _require_configured():
    if not service.configured():
        raise ApiError(503, "push_not_configured", "Reminders when the app is closed aren't set up on this server.")


def _own(endpoint: str) -> PushSubscription:
    sub = db.session.scalar(select(PushSubscription).where(PushSubscription.endpoint == endpoint))
    if sub is None or sub.user_id != current_user().id:
        raise ApiError(404, "not_found", "This device isn't getting reminders.")
    return sub


@bp.get("/config")
def config():
    return {"enabled": service.configured(), "public_key": current_app.config.get("VAPID_PUBLIC_KEY") or None}


@bp.post("/subscriptions")
def subscribe():
    _require_configured()
    data = parse_body(SubscriptionIn)
    user = current_user()
    sub = db.session.scalar(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    if sub is None:
        sub = PushSubscription(endpoint=data.endpoint)
        db.session.add(sub)
    sub.user_id = user.id  # a shared device follows whoever turned reminders on last
    sub.p256dh, sub.auth = data.keys.p256dh, data.keys.auth
    sub.prefs = data.prefs.model_dump()
    db.session.commit()
    return {"ok": True}, 201


@bp.delete("/subscriptions")
def unsubscribe():
    data = parse_body(EndpointIn)
    sub = db.session.scalar(select(PushSubscription).where(PushSubscription.endpoint == data.endpoint))
    if sub is not None and sub.user_id == current_user().id:
        db.session.delete(sub)
        db.session.commit()
    return "", 204


@bp.post("/test")
@limiter.limit("6 per minute")
def test():
    _require_configured()
    sub = _own(parse_body(EndpointIn).endpoint)
    outcome = service.send_test(current_user(), sub)
    if outcome == service.GONE:
        raise ApiError(410, "push_gone", "This device no longer accepts reminders. Switch them off and on again.")
    if outcome == service.RETRY:
        raise ApiError(502, "push_failed", "The browser's push service didn't take it. Try again in a minute.")
    return {"ok": True}


@bp.post("/tick")
@limiter.limit("12 per minute")
def tick():
    secret = current_app.config.get("PUSH_CRON_SECRET") or ""
    sent = request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not secret or not hmac.compare_digest(sent, secret):
        raise ApiError(401, "unauthenticated", "Missing or wrong scheduler key.")
    if not service.configured():
        return {"devices": 0, "sent": 0}
    return service.tick()
