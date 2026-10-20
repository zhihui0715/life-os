"""Fetch a record only if it belongs to the logged-in user. Another user's record looks exactly like a missing one."""

import uuid

from sqlalchemy import select

from app.common.auth import current_user
from app.common.errors import not_found
from app.extensions import db


def get_owned_or_404(model, record_id: uuid.UUID | str, what: str):
    try:
        record_id = uuid.UUID(str(record_id))
    except ValueError:
        raise not_found(what) from None
    record = db.session.scalar(select(model).where(model.id == record_id, model.user_id == current_user().id))
    if record is None:
        raise not_found(what)
    return record
