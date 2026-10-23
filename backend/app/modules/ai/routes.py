"""AI assistance (optional). Flow in the app: choose what to send → preview the exact data → generate → review the
proposal → apply chosen items through the normal task/calendar endpoints."""

from datetime import timedelta
from typing import Literal

from flask import Blueprint
from pydantic import Field
from sqlalchemy import select

from app.common.auth import current_user
from app.common.timeutil import user_today
from app.common.validation import InputModel, QueryModel, parse_body, parse_query
from app.extensions import db, limiter
from app.modules.ai import context, service
from app.modules.ai.models import AiRun
from app.modules.ai.provider import get_provider

bp = Blueprint("ai", __name__, url_prefix="/api/v1/ai")


class DailyPlanRequest(InputModel):
    categories: list[str] = Field(max_length=len(context.CATEGORIES))
    day: Literal["today", "tomorrow"] = "today"


class WeeklyReviewRequest(InputModel):
    categories: list[str] = Field(max_length=len(context.CATEGORIES))
    week: Literal["this", "last"] = "last"


class PreviewRequest(InputModel):
    kind: Literal["daily_plan", "weekly_review"]
    categories: list[str] = Field(max_length=len(context.CATEGORIES))
    day: Literal["today", "tomorrow"] = "today"
    week: Literal["this", "last"] = "last"


class RunsQuery(QueryModel):
    limit: int = Field(default=20, ge=1, le=100)


def _daily(user, data) -> context.Context:
    day = user_today(user) + timedelta(days=1 if data.day == "tomorrow" else 0)
    return context.daily_plan_context(user, context.check_categories("daily_plan", data.categories), day)


def _weekly(user, data) -> context.Context:
    cats = context.check_categories("weekly_review", data.categories)
    return context.weekly_review_context(user, cats, -1 if data.week == "last" else 0)


@bp.get("/status")
def status():
    """Whether AI can be used, and if not, why — the app hides the features and shows this reason."""
    user = current_user()
    provider = get_provider()
    return {
        "configured": provider is not None,
        "provider": provider.name if provider else None,
        "model": provider.model if provider else None,
        "enabled": user.settings.ai_enabled,
        "monthly_token_budget": user.settings.ai_monthly_token_budget,
        "used_this_month": service.month_usage(user),
        "kinds": {k: {key: list(v) for key, v in rules.items()} for k, rules in context.KINDS.items()},
    }


@bp.post("/preview")
def preview():
    """Exactly what would be sent — nothing leaves the server here."""
    user = current_user()
    data = parse_body(PreviewRequest)
    ctx = _daily(user, data) if data.kind == "daily_plan" else _weekly(user, data)
    text = service.render(ctx)
    return {"kind": ctx.kind, "categories": ctx.categories, "payload": text, "approx_tokens": len(text) // 3}


@bp.post("/daily-plan")
@limiter.limit("10 per minute")
def daily_plan():
    user = current_user()
    service.require_ready(user)
    ctx = _daily(user, parse_body(DailyPlanRequest))
    run, plan = service.run(user, ctx)
    return {"run_id": str(run.id), "categories_sent": ctx.categories, "plan": plan,
            "tokens": run.input_tokens + run.output_tokens}


@bp.post("/weekly-review")
@limiter.limit("10 per minute")
def weekly_review():
    user = current_user()
    service.require_ready(user)
    ctx = _weekly(user, parse_body(WeeklyReviewRequest))
    run, review = service.run(user, ctx)
    return {"run_id": str(run.id), "categories_sent": ctx.categories, "review": review,
            "tokens": run.input_tokens + run.output_tokens}


@bp.get("/runs")
def runs():
    """History of AI requests: what was sent (categories) and what it cost. Prompts are never stored."""
    q = parse_query(RunsQuery)
    rows = db.session.scalars(
        select(AiRun).where(AiRun.user_id == current_user().id).order_by(AiRun.created_at.desc()).limit(q.limit)
    ).all()
    return {"items": [
        {"id": str(r.id), "kind": r.kind, "created_at": r.created_at.isoformat(), "categories": r.data_categories_sent,
         "model": r.model, "tokens": r.input_tokens + r.output_tokens, "status": r.status, "error_code": r.error_code}
        for r in rows
    ]}
