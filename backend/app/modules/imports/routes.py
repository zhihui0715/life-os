"""Import from other apps: POST /api/v1/import/preview (dry run) and /apply, each with {"content": <file text>}."""

import logging

from flask import Blueprint, request

from app.common.auth import current_user
from app.common.errors import ApiError
from app.extensions import limiter
from app.modules.imports import service

bp = Blueprint("imports", __name__, url_prefix="/api/v1/import")
log = logging.getLogger(__name__)

MAX_BYTES = 10 * 1024 * 1024  # the rest of the API stays at 1 MB
RATE = "20 per minute"


def _plan():
    request.max_content_length = MAX_BYTES
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or not isinstance(body.get("content"), str) or not body["content"].strip():
        raise ApiError(400, "bad_request", 'Send {"content": <the file\'s text>}.')
    return service.read(current_user(), body["content"])


@bp.post("/preview")
@limiter.limit(RATE)
def preview():
    return service.preview(_plan())


@bp.post("/apply")
@limiter.limit(RATE)
def apply():
    plan = _plan()
    result = service.apply(current_user(), plan)
    log.info("import applied user=%s format=%s added=%d", current_user().id, plan.format, result["added"])
    return result
