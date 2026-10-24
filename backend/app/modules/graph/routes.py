"""The graph view's data: GET /api/v1/graph (read-only)."""

from flask import Blueprint

from app.common.auth import current_user
from app.modules.graph import service

bp = Blueprint("graph", __name__, url_prefix="/api/v1/graph")


@bp.get("")
def graph():
    return service.build(current_user())
