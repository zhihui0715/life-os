"""Reports: GET /reports/<day|week|month>?date=YYYY-MM-DD as JSON (the Reports screen) or .pdf, the email status, and a
"send me one now" button. Scheduled emails go out from `flask send-reports` (app/cli.py)."""

import logging
from datetime import date

from flask import Blueprint, Response, request

from app.common.auth import current_user
from app.common.errors import ApiError
from app.common.mail import mail_configured, send_mail
from app.common.timeutil import user_today
from app.extensions import limiter
from app.modules.reports import service

bp = Blueprint("reports", __name__, url_prefix="/api/v1/reports")
log = logging.getLogger(__name__)


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


@bp.get("/email")
def email_status():
    """Whether this server can send email, and the address it would go to."""
    return {"configured": mail_configured(), "to": current_user().email}


@bp.post("/email/test")
@limiter.limit("3 per hour")
def email_test():
    """Sends last week's report now, so you can see what arrives."""
    user = current_user()
    if not mail_configured():
        raise ApiError(409, "email_not_configured", "This server has no email account set up")
    send_report(user, "week", service.last_complete(user, "week").start)
    return {"sent_to": user.email}


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


def send_report(user, kind: str, anchor: date) -> None:
    """Builds the report of `kind` containing `anchor` and emails it, PDF attached."""
    from app.modules.reports.pdf import build_pdf, email_text

    r = service.build(user, kind, anchor)
    subject, text, html = email_text(user, r)
    send_mail(user.email, subject, text, html,
              [(f"life-os-{kind}-report-{r['period']['start']}.pdf", build_pdf(user, r), "application/pdf")])
    log.info("report emailed user=%s kind=%s start=%s", user.id, kind, r["period"]["start"])
