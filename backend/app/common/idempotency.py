"""Idempotency keys (docs/02-api-conventions.md §6).

A write sent with the header `Idempotency-Key: <uuid>` is remembered for 24 hours. If the same key arrives again —
typically an offline action replayed after reconnecting, when the first attempt actually reached the server but the
reply was lost — the server returns the stored reply instead of doing the work twice.

Only finished outcomes are remembered: successes and definite refusals (404/409/422). Server errors, rate limits and
auth failures are not, so retrying those really retries.
"""

import json
import re
from datetime import timedelta

from flask import Response, g, request
from sqlalchemy import delete, select
from sqlalchemy.dialects.postgresql import insert

from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.models_idempotency import IdempotencyKey
from app.extensions import db

HEADER = "Idempotency-Key"
TTL = timedelta(hours=24)
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
REMEMBERED = lambda status: 200 <= status < 300 or status in (404, 409, 422)  # noqa: E731
KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def _key():
    if request.method not in WRITE_METHODS or g.get("user") is None:
        return None
    key = request.headers.get(HEADER)
    if key is None:
        return None
    if not KEY_PATTERN.match(key):
        raise ApiError(400, "bad_request", f"{HEADER} must be 8–64 letters, digits, - or _.")
    return key


def replay_if_seen():
    """before_request (after auth): answer a repeated key from storage."""
    key = _key()
    if key is None:
        return None
    g.idempotency_key = key
    row = db.session.scalar(select(IdempotencyKey).where(
        IdempotencyKey.user_id == g.user.id, IdempotencyKey.key == key, IdempotencyKey.created_at > utcnow() - TTL))
    if row is None:
        return None
    if (row.method, row.path) != (request.method, request.path):
        raise ApiError(422, "idempotency_key_reused", "This Idempotency-Key was already used for a different request.")
    body = "" if row.response is None else json.dumps(row.response)
    resp = Response(body, status=row.status_code, mimetype="application/json" if row.response is not None else None)
    resp.headers["Idempotent-Replay"] = "true"
    return resp


def remember(response):
    """after_request: store the outcome of a keyed write."""
    key = g.pop("idempotency_key", None)
    if key is None or response.headers.get("Idempotent-Replay") or not REMEMBERED(response.status_code):
        return response
    try:
        body = response.get_json(silent=True) if response.status_code != 204 else None
        db.session.rollback()  # never commit leftovers of a failed request together with the key
        db.session.execute(delete(IdempotencyKey).where(
            IdempotencyKey.user_id == g.user.id, IdempotencyKey.created_at <= utcnow() - TTL))
        db.session.execute(insert(IdempotencyKey).values(
            user_id=g.user.id, key=key, method=request.method, path=request.path,
            status_code=response.status_code, response=body,
        ).on_conflict_do_nothing())
        db.session.commit()
    except Exception:  # remembering is a safety net; never turn a done request into an error
        db.session.rollback()
    return response
