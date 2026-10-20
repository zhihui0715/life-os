from datetime import date, datetime, timedelta, timezone
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.common.timeutil import user_today

KL = ZoneInfo("Asia/Kuala_Lumpur")


def kl_today() -> date:
    return datetime.now(KL).date()


def create(api, **fields):
    res = api.post("/api/v1/tasks", {"title": "Task", **fields})
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def view(api, name):
    return [t["title"] for t in api.get(f"/api/v1/tasks?view={name}").get_json()["items"]]


def test_create_task_defaults(api):
    t = create(api, title="  Write report  ")
    assert t["title"] == "Write report"  # whitespace trimmed
    assert t["status"] == "inbox"
    assert t["priority"] == 3
    assert t["completed_at"] is None


def test_create_task_validation(api):
    res = api.post("/api/v1/tasks", {"title": "", "priority": 9, "estimate_minutes": -5})
    assert res.status_code == 422
    assert set(res.get_json()["error"]["fields"]) == {"title", "priority", "estimate_minutes"}


def test_deadline_must_include_timezone(api):
    res = api.post("/api/v1/tasks", {"title": "x", "deadline": "2026-11-01T17:00:00"})
    assert res.status_code == 422
    ok = api.post("/api/v1/tasks", {"title": "x", "deadline": "2026-11-01T17:00:00+08:00"})
    assert ok.get_json()["deadline"] == "2026-11-01T09:00:00+00:00"  # stored and returned in UTC


def test_cannot_create_directly_as_done(api):
    assert api.post("/api/v1/tasks", {"title": "x", "status": "done"}).status_code == 422


def test_client_generated_id_and_duplicate(api):
    tid = "6f1c1d36-8b8a-4f5e-9d4b-1a2b3c4d5e6f"
    assert create(api, id=tid)["id"] == tid
    assert api.post("/api/v1/tasks", {"id": tid, "title": "again"}).status_code == 409


def test_edit_task_and_clear_optional_field(api):
    t = create(api, due_date="2026-12-01", notes="n")
    res = api.patch(f"/api/v1/tasks/{t['id']}", {"title": "Renamed", "due_date": None, "priority": 1})
    body = res.get_json()
    assert body["title"] == "Renamed" and body["due_date"] is None and body["priority"] == 1
    assert body["notes"] == "n"  # untouched


def test_required_fields_cannot_be_nulled(api):
    t = create(api)
    assert api.patch(f"/api/v1/tasks/{t['id']}", {"title": None}).status_code == 422


def test_complete_and_reopen(api):
    t = create(api, status="todo")
    done = api.post(f"/api/v1/tasks/{t['id']}/complete").get_json()
    assert done["status"] == "done" and done["completed_at"] is not None
    # completing twice keeps the original completion time
    again = api.post(f"/api/v1/tasks/{t['id']}/complete").get_json()
    assert again["completed_at"] == done["completed_at"]
    reopened = api.post(f"/api/v1/tasks/{t['id']}/reopen").get_json()
    assert reopened["status"] == "todo" and reopened["completed_at"] is None


def test_status_change_on_done_task_requires_reopen(api):
    t = create(api)
    api.post(f"/api/v1/tasks/{t['id']}/complete")
    res = api.patch(f"/api/v1/tasks/{t['id']}", {"status": "todo"})
    assert res.get_json()["error"]["code"] == "rule_violation"


def test_archive_keeps_history_and_restore(api):
    t = create(api)
    api.post(f"/api/v1/tasks/{t['id']}/complete")
    archived = api.post(f"/api/v1/tasks/{t['id']}/archive").get_json()
    assert archived["status"] == "done"  # archiving remembers it was done
    assert view(api, "all") == [] and view(api, "archived") == ["Task"]
    api.post(f"/api/v1/tasks/{t['id']}/restore")
    assert view(api, "completed") == ["Task"]


def test_delete_rules(api):
    open_task = create(api)
    assert api.delete(f"/api/v1/tasks/{open_task['id']}").status_code == 204
    done = create(api)
    api.post(f"/api/v1/tasks/{done['id']}/complete")
    res = api.delete(f"/api/v1/tasks/{done['id']}")
    assert res.status_code == 422 and res.get_json()["error"]["code"] == "rule_violation"


def test_stale_update_detected(api):
    t = create(api)
    api.patch(f"/api/v1/tasks/{t['id']}", {"title": "changed elsewhere"})
    res = api.patch(f"/api/v1/tasks/{t['id']}", {"title": "mine", "if_updated_at": t["updated_at"]})
    assert res.status_code == 409
    assert res.get_json()["error"]["current"]["title"] == "changed elsewhere"


def test_category_must_belong_to_user(api):
    res = api.post("/api/v1/tasks", {"title": "x", "category_id": "00000000-0000-0000-0000-000000000001"})
    assert res.status_code == 404
    cat = api.get("/api/v1/categories").get_json()["items"][0]
    assert create(api, category_id=cat["id"])["category_id"] == cat["id"]


def test_views_use_users_local_day(api):
    today = kl_today()
    create(api, title="overdue", status="todo", due_date=(today - timedelta(days=1)).isoformat())
    create(api, title="today", status="todo", due_date=today.isoformat())
    create(api, title="later", status="todo", due_date=(today + timedelta(days=3)).isoformat())
    create(api, title="no date", status="todo")
    create(api, title="inbox item")
    past_deadline = (datetime.now(timezone.utc) - timedelta(minutes=1)).isoformat()
    create(api, title="missed deadline", status="todo", deadline=past_deadline)

    assert set(view(api, "overdue")) == {"overdue", "missed deadline"}
    assert view(api, "today") == ["today"]
    assert view(api, "upcoming") == ["later"]
    assert view(api, "unscheduled") == ["no date"]
    assert view(api, "inbox") == ["inbox item"]

    items = api.get("/api/v1/tasks?view=overdue").get_json()["items"]
    assert all(t["is_overdue"] for t in items)


def test_local_day_boundary_in_malaysia():
    """23:30 in Kuala Lumpur is 15:30 UTC the same date; 00:30 KL is still the previous day in UTC."""
    user = SimpleNamespace(settings=SimpleNamespace(timezone="Asia/Kuala_Lumpur"))
    late_evening = datetime(2026, 10, 20, 15, 30, tzinfo=timezone.utc)
    just_after_midnight = datetime(2026, 10, 20, 16, 30, tzinfo=timezone.utc)
    assert user_today(user, late_evening) == date(2026, 10, 20)
    assert user_today(user, just_after_midnight) == date(2026, 10, 21)


def test_pagination(api):
    for i in range(5):
        create(api, title=f"t{i}")
    first = api.get("/api/v1/tasks?limit=2").get_json()
    assert first["total"] == 5 and len(first["items"]) == 2 and first["next_cursor"]
    seen = [t["id"] for t in first["items"]]
    cursor = first["next_cursor"]
    while cursor:
        page = api.get(f"/api/v1/tasks?limit=2&cursor={cursor}").get_json()
        seen += [t["id"] for t in page["items"]]
        cursor = page["next_cursor"]
    assert len(seen) == len(set(seen)) == 5
    assert api.get("/api/v1/tasks?cursor=garbage").status_code == 422


def test_chinese_text_round_trips(api):
    t = create(api, title="复习网络安全笔记", notes="第三章：密码学")
    assert api.get(f"/api/v1/tasks/{t['id']}").get_json()["title"] == "复习网络安全笔记"


def test_error_response_shape(api):
    body = api.get("/api/v1/tasks/not-a-uuid").get_json()
    assert body["error"]["code"] == "not_found"
    assert body["error"]["request_id"]
