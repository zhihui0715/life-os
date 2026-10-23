"""Stage 6: backup export and restore. The key test is the round trip: export → wipe the database → restore →
identical record counts and checksums."""

import copy
import json
import logging
from datetime import datetime, time, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.extensions import db
from app.modules.auth.service import create_user
from app.modules.backup import service
from tests.conftest import TEST_PASSWORD, ApiClient

KL = ZoneInfo("Asia/Kuala_Lumpur")
SECRET = "Private journal line that must never reach the server log"


def today():
    return datetime.now(KL).date()


def at(d, hh):
    return datetime.combine(d, time(hh), KL).isoformat()


def ok(res, status=(200, 201)):
    assert res.status_code in ((status,) if isinstance(status, int) else status), res.get_json()
    return res.get_json()


def fill_account(api):
    """Something in every table, including the tricky links (subtasks, exceptions, focus → activity)."""
    cat = ok(api.post("/api/v1/categories", {"name": "Guitar", "kind": "learning", "color": "#AA3366"}))
    goal = ok(api.post("/api/v1/goals", {"title": "Pass CCNA", "progress_mode": "milestones", "category_id": cat["id"]}))
    ms = ok(api.post(f"/api/v1/goals/{goal['id']}/milestones", {"title": "Theory", "weight": 3}))
    ok(api.post(f"/api/v1/milestones/{ms['id']}/complete"))
    parent = ok(api.post("/api/v1/tasks", {"title": "Write report", "status": "todo", "tags": ["work", "写作"],
                                            "goal_id": goal["id"], "milestone_id": ms["id"], "estimate_minutes": 90}))
    ok(api.post("/api/v1/tasks", {"title": "=Outline", "parent_task_id": parent["id"]}))
    d = today() + timedelta(days=3)
    ev = ok(api.post("/api/v1/calendar/events", {"title": "Standup", "starts_at": at(d, 9), "ends_at": at(d, 10),
                                                 "rrule": "FREQ=DAILY;COUNT=3"}))
    first = api.get(f"/api/v1/calendar/occurrences?start={quote(at(d, 0))}&end={quote(at(d + timedelta(days=4), 0))}")
    original = first.get_json()["items"][0]["original_start"]
    assert api.delete(f"/api/v1/calendar/events/{ev['id']}/occurrence?original_start={quote(original)}").status_code == 204
    habit = ok(api.post("/api/v1/habits", {"name": "Read", "start_date": (today() - timedelta(days=2)).isoformat(),
                                           "target_value": 20.5, "target_unit": "pages"}))
    ok(api.put(f"/api/v1/habits/{habit['id']}/logs/{today().isoformat()}", {"state": "done", "value": 12.25}))
    ok(api.put(f"/api/v1/journal/{today().isoformat()}", {"body": SECRET, "mood": 4, "gratitude": "家人"}))
    focus = ok(api.post("/api/v1/focus-sessions", {"planned_minutes": 25, "task_id": parent["id"]}))
    ok(api.post(f"/api/v1/focus-sessions/{focus['id']}/stop", {}))
    ok(api.post(f"/api/v1/tasks/{parent['id']}/complete"))
    ok(api.post("/api/v1/activity-logs", {"title": "Gym", "duration_minutes": 45}))
    ok(api.patch("/api/v1/settings", {
        "theme": "dark", "weekly_learning_target_min": 300,
        "working_hours": {"mon": [["08:00", "12:00"], ["13:00", "17:00"]]},  # JSON object
        "dashboard_layout": [{"key": "habits", "visible": False}],  # JSON list
        "score_weights": {"tasks": 40, "goals_learning": 20, "habits": 30, "wellbeing": 10},
    }))


def export(api):
    res = api.get("/api/v1/backup/export")
    assert res.status_code == 200
    assert "attachment" in res.headers["Content-Disposition"]
    return json.loads(res.data)


def preview(api, backup):
    return api.post("/api/v1/backup/import/preview", {"backup": backup})


def apply(api, backup, token, replace=False):
    return api.post("/api/v1/backup/import/apply", {"backup": backup, "preview_token": token, "replace_existing": replace})


def wipe_database():
    tables = ", ".join(t.name for t in db.metadata.sorted_tables)
    db.session.execute(text(f"TRUNCATE {tables} CASCADE"))
    db.session.commit()


def new_account(app, email="fresh@example.test"):
    create_user(email, TEST_PASSWORD, "Fresh", "en")
    c = ApiClient(app.test_client())
    assert c.login(email).status_code == 200
    return c


def test_export_contains_every_table_with_counts_and_checksums(api):
    fill_account(api)
    b = export(api)
    assert b["format"] == "life-os-backup" and b["format_version"] == 1
    assert set(b["data"]) == set(service.TABLES)
    assert all(b["counts"][t] >= 1 for t in service.TABLES if t != "ai_runs"), b["counts"]
    assert b["counts"]["tasks"] == 2 and b["counts"]["task_tags"] == 2 and b["counts"]["event_exceptions"] == 1
    assert all("user_id" not in row for rows in b["data"].values() for row in rows)
    assert b["data"]["habit_logs"][0]["value"] == "12.25"  # exact decimals, not floats


def test_round_trip_export_wipe_restore_is_identical(app, api):
    fill_account(api)
    before = export(api)

    wipe_database()
    fresh = new_account(app)
    p = ok(preview(fresh, before))
    assert p["account_empty"] is True  # default categories only
    assert p["tables"]["tasks"] == {"current": 0, "in_backup": 2, "added": 2, "changed": 0, "unchanged": 0, "removed": 0}
    ok(apply(fresh, before, p["preview_token"]))

    after = export(fresh)
    assert after["counts"] == before["counts"]
    assert after["checksums"] == before["checksums"]
    assert after["data"] == before["data"]
    # And the app works on the restored data, links included
    tasks = fresh.get("/api/v1/tasks?status=done").get_json()["items"]
    assert [t["title"] for t in tasks] == ["Write report"] and len(tasks[0]["tags"]) == 2
    settings = fresh.get("/api/v1/settings").get_json()
    assert settings["theme"] == "dark" and settings["working_hours"]["mon"] == [["08:00", "12:00"], ["13:00", "17:00"]]


def test_preview_is_a_dry_run(api):
    fill_account(api)
    b = export(api)
    ok(api.post("/api/v1/tasks", {"title": "Added after the backup"}))
    snapshot = export(api)["checksums"]
    p = ok(preview(api, b))
    assert p["account_empty"] is False
    assert p["tables"]["tasks"]["removed"] == 1 and p["tables"]["tasks"]["unchanged"] == 2
    assert export(api)["checksums"] == snapshot  # nothing changed


def test_restore_never_overwrites_without_confirmation(api):
    fill_account(api)
    b = export(api)
    ok(api.post("/api/v1/tasks", {"title": "Newer task"}))
    token = ok(preview(api, b))["preview_token"]

    res = apply(api, b, token)  # no replace_existing
    assert res.status_code == 409 and res.get_json()["error"]["code"] == "account_not_empty"
    assert apply(api, b, "made-up-token", replace=True).get_json()["error"]["code"] == "preview_outdated"

    ok(api.post("/api/v1/tasks", {"title": "Even newer"}))  # data changed after the preview
    assert apply(api, b, token, replace=True).get_json()["error"]["code"] == "preview_outdated"

    token = ok(preview(api, b))["preview_token"]
    ok(apply(api, b, token, replace=True))
    assert export(api)["checksums"] == b["checksums"]


def test_damaged_or_foreign_files_are_rejected_before_anything_changes(api):
    fill_account(api)
    b = export(api)
    edited = copy.deepcopy(b)
    edited["data"]["tasks"][0]["title"] = "Tampered"
    cases = [
        ({"hello": "world"}, "isn't a Life OS backup"),
        ({**b, "format_version": 99}, "newer version"),
        (edited, "checksum"),
        ({**b, "data": {**b["data"], "secrets": []}}, "unknown sections"),
    ]
    for bad, message in cases:
        res = preview(api, bad)
        assert res.status_code == 422, bad.keys()
        assert message in res.get_json()["error"]["message"]
    assert export(api)["checksums"] == b["checksums"]


def test_invalid_values_are_explained(api):
    fill_account(api)
    b = export(api)
    broken = copy.deepcopy(b)
    broken["data"]["journal_entries"][0]["mood"] = 9  # breaks a database rule
    broken["checksums"]["journal_entries"] = service._checksum(broken["data"]["journal_entries"])
    res = preview(api, broken)
    assert res.status_code == 422 and "journal_entries" in res.get_json()["error"]["message"]

    broken = copy.deepcopy(b)
    broken["data"]["tasks"][0]["created_at"] = "yesterday"
    rows = sorted(broken["data"]["tasks"], key=service._sort_key("tasks"))
    broken["checksums"]["tasks"] = service._checksum(rows)
    res = preview(api, broken)
    assert res.status_code == 422 and "created_at" in res.get_json()["error"]["message"]


def test_backup_from_another_account_on_same_server_conflicts(app, api):
    fill_account(api)
    b = export(api)
    other = new_account(app, "other@example.test")
    res = preview(other, b)
    assert res.status_code == 409 and res.get_json()["error"]["code"] == "backup_conflict"


def test_journal_text_never_logged_during_backup(api, caplog):
    fill_account(api)
    with caplog.at_level(logging.DEBUG):
        b = export(api)
        token = ok(preview(api, b))["preview_token"]
        ok(apply(api, b, token, replace=True))
    assert SECRET not in caplog.text


def test_import_accepts_files_larger_than_the_normal_limit(api):
    b = export(api)
    b["padding_ignored"] = "x" * (2 * 1024 * 1024)  # 2 MB: over the 1 MB API limit, under the import limit
    assert preview(api, b).status_code == 200
    big = api.post("/api/v1/tasks", {"title": "x" * (2 * 1024 * 1024)})
    assert big.status_code == 413


def test_csv_exports_are_spreadsheet_safe(api):
    fill_account(api)
    res = api.get("/api/v1/backup/export/tasks.csv")
    assert res.status_code == 200 and res.mimetype == "text/csv"
    body = res.data.decode("utf-8-sig")
    assert body.splitlines()[0].startswith("title,status")
    assert "'=Outline" in body and "写作" in body
    activity = api.get("/api/v1/backup/export/activity.csv").data.decode("utf-8-sig")
    assert "Gym" in activity and activity.splitlines()[0].startswith("date,title,minutes")


def test_backup_requires_login(anon):
    assert anon.get("/api/v1/backup/export").status_code == 401
    assert anon.post("/api/v1/backup/import/preview", {"backup": {}}).status_code == 401


def test_backup_made_before_a_table_existed_still_restores(api):
    fill_account(api)
    b = export(api)
    del b["data"]["ai_runs"], b["checksums"]["ai_runs"], b["counts"]["ai_runs"]  # as a Stage 6 file looked
    p = ok(preview(api, b))
    assert p["tables"]["ai_runs"]["in_backup"] == 0
    ok(apply(api, b, p["preview_token"], replace=True))


def test_verify_restore_command(app, api):
    """The restore-drill command (docs/04-deployment.md): same database on both sides → verified."""
    import os

    fill_account(api)
    url = os.environ["TEST_DATABASE_URL"]
    result = app.test_cli_runner().invoke(args=["verify-restore", "--source", url, "--target", url])
    assert result.exit_code == 0, result.output
    assert "Restore verified" in result.output
