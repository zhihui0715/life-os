"""Reports: GET /reports/<day|week|month>?date=YYYY-MM-DD as JSON (the Reports screen) or .pdf."""

from datetime import date

from flask import Blueprint, Response, request

from app.common.auth import current_user
from app.common.errors import ApiError
from app.common.timeutil import user_today
from app.extensions import limiter
from app.modules.reports import service

bp = Blueprint("reports", __name__, url_prefix="/api/v1/reports")


def _kind(kind: str) -> str:
    if kind not in service.KINDS:
        raise ApiError(404, "not_found", "Reports are day, week or month")
    return kind


def _anchor(user) -> date:
    raw = request.args.get("date")
    if not raw:
        return user_today(user)
    try:
        return date.fromisoformat(raw)
    except ValueError:
        raise ApiError(422, "validation_error", "date must be YYYY-MM-DD") from None


@bp.get("/<kind>")
def report(kind):
    user = current_user()
    return service.build(user, _kind(kind), _anchor(user))


@bp.get("/<kind>.pdf")
@limiter.limit("12 per minute")
def report_pdf(kind):
    from app.modules.reports.pdf import build_pdf  # ReportLab loads only when a PDF is asked for

    user = current_user()
    r = service.build(user, _kind(kind), _anchor(user))
    body = build_pdf(user, r)
    return Response(body, mimetype="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="life-os-{kind}-report-{r["period"]["start"]}.pdf"'})

