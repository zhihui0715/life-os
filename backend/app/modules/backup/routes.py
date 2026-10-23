"""Backup & restore. Export downloads one JSON file; restore is preview (dry run) → apply with the preview's token.
CSV exports of tasks and activity are a convenience for spreadsheets — they can't be restored."""

import csv
import io
import json
import logging
from datetime import date

from flask import Blueprint, Response, request
from sqlalchemy import select

from app.common.auth import current_user
from app.common.errors import ApiError
from app.common.timeutil import user_today
from app.extensions import db
from app.modules.activity.models import ActivityLog
from app.modules.backup import service
from app.modules.categories.models import Category
from app.modules.goals.models import Goal
from app.modules.tasks.models import Task

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


@bp.post("/import/preview")
def import_preview():
    """Dry run: validates the file, runs the whole restore, reports what would change, then undoes everything."""
    _, backup = _import_body()
    user = current_user()
    result, json_rows, db_rows = _preview(user, backup)
    service.restore(user.id, json_rows, db_rows)
    db.session.rollback()
    return result


@bp.post("/import/apply")
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


# ---------- CSV ----------

def _cell(value) -> str:
    """Spreadsheet-safe text: a cell starting with = + - @ would run as a formula when opened in Excel."""
    if value is None:
        return ""
    s = value.isoformat() if isinstance(value, date) else str(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s


def _csv(header, rows) -> str:
    out = io.StringIO()
    w = csv.writer(out)
    w.writerow(header)
    w.writerows([_cell(v) for v in row] for row in rows)
    return "﻿" + out.getvalue()  # the BOM makes Excel read UTF-8 (Chinese text) correctly


def _names(model, user_id) -> dict:
    return dict(db.session.execute(select(model.id, model.title if model is Goal else model.name).where(model.user_id == user_id)).all())


@bp.get("/export/tasks.csv")
def export_tasks_csv():
    user = current_user()
    cats, goals = _names(Category, user.id), _names(Goal, user.id)
    tasks = db.session.scalars(select(Task).where(Task.user_id == user.id).order_by(Task.created_at)).all()
    rows = [
        (t.title, t.status, t.priority, t.due_date, t.deadline, t.estimate_minutes, t.actual_minutes_manual,
         cats.get(t.category_id), goals.get(t.goal_id), " ".join(tag.name for tag in t.tags),
         "yes" if t.parent_task_id else "", t.completed_at, t.archived_at, t.created_at, t.notes)
        for t in tasks
    ]
    header = ("title", "status", "priority", "due_date", "deadline", "estimate_minutes", "actual_minutes", "category",
              "goal", "tags", "is_subtask", "completed_at", "archived_at", "created_at", "notes")
    return _download(_csv(header, rows), f"life-os-tasks-{_stamp()}.csv", "text/csv")


@bp.get("/export/activity.csv")
def export_activity_csv():
    user = current_user()
    cats, goals = _names(Category, user.id), _names(Goal, user.id)
    logs = db.session.scalars(
        select(ActivityLog).where(ActivityLog.user_id == user.id).order_by(ActivityLog.log_date, ActivityLog.started_at)
    ).all()
    rows = [
        (a.log_date, a.title, a.duration_minutes, cats.get(a.category_id), goals.get(a.goal_id), a.started_at,
         a.ended_at, "yes" if a.focus_session_id else "", a.outcome, a.notes)
        for a in logs
    ]
    header = ("date", "title", "minutes", "category", "goal", "started_at", "ended_at", "from_focus", "outcome", "notes")
    return _download(_csv(header, rows), f"life-os-activity-{_stamp()}.csv", "text/csv")
