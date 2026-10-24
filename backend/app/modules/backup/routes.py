"""Backup & restore. Export downloads one JSON file; restore is preview (dry run) → apply with the preview's token.
The PDF report is for reading and printing — it can't be restored."""

import json
import logging

from flask import Blueprint, Response, request

from app.common.auth import current_user
from app.common.errors import ApiError
from app.common.timeutil import user_today
from app.extensions import db, limiter
from app.modules.backup import service

bp = Blueprint("backup", __name__, url_prefix="/api/v1/backup")
log = logging.getLogger(__name__)

IMPORT_MAX_BYTES = 50 * 1024 * 1024  # the rest of the API stays at 1 MB


def _download(body: str, filename: str, mimetype: str) -> Response:
    return Response(body, mimetype=mimetype, headers={"Content-Disposition": f'attachment; filename="{filename}"'})


def _stamp() -> str:
    return user_today(current_user()).isoformat()


@bp.get("/export")
def export_json():
    user = current_user()
    backup = service.export(user)
    log.info("backup exported user=%s rows=%d", user.id, sum(backup["counts"].values()))
    return _download(json.dumps(backup, ensure_ascii=False, indent=1), f"life-os-backup-{_stamp()}.json", "application/json")


def _import_body() -> tuple[dict, dict]:
    request.max_content_length = IMPORT_MAX_BYTES
    body = request.get_json(silent=True)
    if not isinstance(body, dict) or "backup" not in body:
        raise ApiError(400, "bad_request", 'Send {"backup": <the backup file\'s contents>}.')
    return body, body["backup"]


def _preview(user, backup):
    json_rows, db_rows = service.validate(backup)
    current = service.snapshot(user.id)
    result = {
        "account_empty": service.account_is_empty(current),
        "exported_at": backup.get("exported_at"),
        "account": backup.get("account"),
        "tables": service.diff(current, json_rows),
        "preview_token": service.preview_token(current, backup["checksums"]),
    }
    return result, json_rows, db_rows


IMPORT_RATE = "6 per minute"  # each call may carry up to 50 MB and runs a full restore


@bp.post("/import/preview")
@limiter.limit(IMPORT_RATE)
def import_preview():
    """Dry run: validates the file, runs the whole restore, reports what would change, then undoes everything."""
    _, backup = _import_body()
    user = current_user()
    result, json_rows, db_rows = _preview(user, backup)
    service.restore(user.id, json_rows, db_rows)
    db.session.rollback()
    return result


@bp.post("/import/apply")
@limiter.limit(IMPORT_RATE)
def import_apply():
    body, backup = _import_body()
    user = current_user()
    result, json_rows, db_rows = _preview(user, backup)
    if body.get("preview_token") != result["preview_token"]:
        raise ApiError(409, "preview_outdated", "Your data or the file changed since the preview. Preview again.")
    if not result["account_empty"] and body.get("replace_existing") is not True:
        raise ApiError(409, "account_not_empty", "This account already has data. Confirm that the backup should replace it.")
    service.restore(user.id, json_rows, db_rows)
    db.session.commit()
    log.info("backup restored user=%s rows=%d", user.id, sum(len(r) for r in json_rows.values()))
    return {"restored": {name: len(rows) for name, rows in json_rows.items()}}


@bp.get("/export/report.pdf")
@limiter.limit("6 per minute")
def export_pdf():
    """A readable PDF of your data. For reading and printing — it can't be restored (the JSON file is the backup)."""
    from app.modules.backup.report import build_report  # ReportLab loads only when a report is asked for

    user = current_user()
    body = build_report(user)
    log.info("report exported user=%s bytes=%d", user.id, len(body))
    return Response(body, mimetype="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="life-os-report-{_stamp()}.pdf"'})
