from typing import Literal

from flask import Blueprint
from pydantic import Field

from app.common.auth import current_user
from app.common.validation import QueryModel, parse_query
from app.modules.insights import metrics

bp = Blueprint("insights", __name__, url_prefix="/api/v1/insights")


class OverviewQuery(QueryModel):
    period: Literal["week", "month"] = "week"
    offset: int = Field(default=0, ge=-60, le=0)  # 0 = current, -1 = previous …


class TrendQuery(QueryModel):
    weeks: int = Field(default=8, ge=2, le=26)


@bp.get("/overview")
def overview():
    q = parse_query(OverviewQuery)
    user = current_user()
    current = metrics.compute_period(user, metrics.period_for(user, q.period, q.offset))
    previous = metrics.compute_period(user, metrics.period_for(user, q.period, q.offset - 1), full=False)
    return {
        **current,
        "previous": {
            "period": previous["period"],
            "score": previous["score"]["value"],
            "components": {k: v["score"] for k, v in previous["components"].items()},
            "learning_minutes": previous["components"]["goals_learning"]["learning_minutes"],
        },
    }


@bp.get("/trend")
def trend():
    q = parse_query(TrendQuery)
    return {"weeks": metrics.trend(current_user(), q.weeks)}
