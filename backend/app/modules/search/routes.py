"""Search everything: GET /api/v1/search?q=… (read-only)."""

from flask import Blueprint
from pydantic import Field

from app.common.auth import current_user
from app.common.validation import QueryModel, parse_query
from app.modules.search import service

bp = Blueprint("search", __name__, url_prefix="/api/v1/search")


class SearchQuery(QueryModel):
    q: str = Field(min_length=1, max_length=200)
    limit: int = Field(default=6, ge=1, le=20)  # per group


@bp.get("")
def search():
    query = parse_query(SearchQuery)
    return service.search(current_user(), query.q, query.limit)
