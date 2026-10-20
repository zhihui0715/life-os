"""API tests for Stage 4: habits, journal, activity logs and focus sessions."""

import logging
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.modules.activity import service as activity_service

KL = ZoneInfo("Asia/Kuala_Lumpur")


def today():
    return datetime.now(KL).date()


def ago(n):
    return (today() - timedelta(days=n)).isoformat()


# ---------- habits ----------

def habit(api, **fields):
    res = api.post("/api/v1/habits", {"name": "Read", **fields})
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def check_in(api, hid, day, state="done", **extra):
    res = api.put(f"/api/v1/habits/{hid}/logs/{day}", {"state": state, **extra})
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def test_habit_check_ins_build_a_streak(api):
    h = habit(api, start_date=ago(4))
    for n in (4, 3, 2, 1):
        check_in(api, h["id"], ago(n))
    detail = check_in(api, h["id"], ago(0), value=20, note="Chapter 3")
    assert detail["stats"]["current_streak"] == 5
    assert detail["today"] == {"state": "done", "value": 20.0, "note": "Chapter 3"}
    assert [d["status"] for d in detail["history"]] == ["done"] * 5


def test_missed_day_is_computed_not_stored_and_correctable(api):
    h = habit(api, start_date=ago(3))
    check_in(api, h["id"], ago(3))
    check_in(api, h["id"], ago(1))
    detail = api.get(f"/api/v1/habits/{h['id']}").get_json()
    assert [d["status"] for d in detail["history"]] == ["done", "missed", "done", "open"]
    assert detail["stats"]["current_streak"] == 1
    # Fix the history: you actually did it that day
    fixed = check_in(api, h["id"], ago(2))
    assert fixed["stats"]["current_streak"] == 3
    # Undo a check-in
    undone = api.delete(f"/api/v1/habits/{h['id']}/logs/{ago(1)}").get_json()
    assert undone["history"][2]["status"] == "missed"


def test_skip_is_a_rest_day(api):
    h = habit(api, start_date=ago(2))
    check_in(api, h["id"], ago(2))
    check_in(api, h["id"], ago(1), state="skipped")
    detail = check_in(api, h["id"], ago(0))
    assert detail["stats"]["current_streak"] == 2
    assert detail["stats"]["consistency"] == 1.0  # skipped days are left out


def test_check_in_rules(api):
    h = habit(api, start_date=ago(1))
    tomorrow = (today() + timedelta(days=1)).isoformat()
    assert api.put(f"/api/v1/habits/{h['id']}/logs/{tomorrow}", {"state": "done"}).get_json()["error"]["code"] == "rule_violation"
    assert api.put(f"/api/v1/habits/{h['id']}/logs/{ago(5)}", {"state": "done"}).get_json()["error"]["code"] == "rule_violation"
    assert api.put(f"/api/v1/habits/{h['id']}/logs/{ago(0)}", {"state": "missed"}).status_code == 422
    assert api.put(f"/api/v1/habits/{h['id']}/logs/not-a-date", {"state": "done"}).status_code == 404


def test_weekday_schedule_validation_and_change_history(api):
    assert api.post("/api/v1/habits", {"name": "Gym", "schedule_type": "weekdays"}).status_code == 422
    h = habit(api, name="Gym", schedule_type="weekdays", weekday_mask=1 | 4 | 16, start_date=ago(10))
    assert h["schedule_type"] == "weekdays" and h["weekday_mask"] == 21
    changed = api.patch(f"/api/v1/habits/{h['id']}", {"schedule_type": "daily"}).get_json()
    assert changed["schedule_type"] == "daily"
    assert [c["schedule_type"] for c in changed["schedule_changes"]] == ["weekdays", "daily"]
    assert changed["schedule_changes"][1]["effective_from"] == today().isoformat()


def test_weekly_target_habit(api):
    h = habit(api, name="Run", schedule_type="x_per_week", times_per_week=2, start_date=ago(0))
    detail = check_in(api, h["id"], ago(0))
    assert detail["stats"]["unit"] == "weeks"
    assert (detail["stats"]["done_this_week"], detail["stats"]["target_this_week"]) == (1, 2)


def test_archive_keeps_logs_and_hides_habit(api):
    h = habit(api, start_date=ago(0))
    check_in(api, h["id"], ago(0))
    api.post(f"/api/v1/habits/{h['id']}/archive")
    assert api.get("/api/v1/habits").get_json()["items"] == []
    archived = api.get("/api/v1/habits?archived_only=true").get_json()["items"]
    assert archived[0]["today"]["state"] == "done"


# ---------- journal ----------

def test_journal_upsert_partial_and_clear(api):
    day = ago(0)
    created = api.put(f"/api/v1/journal/{day}", {"body": "Good day.", "mood": 4})
    assert created.status_code == 201
    updated = api.put(f"/api/v1/journal/{day}", {"went_well": "Finished the lab", "energy": 3}).get_json()
    assert (updated["body"], updated["went_well"], updated["mood"], updated["energy"]) == ("Good day.", "Finished the lab", 4, 3)
    # Clearing every field removes the entry instead of keeping an empty row
    res = api.put(f"/api/v1/journal/{day}", {"body": "", "went_well": None, "mood": None, "energy": None})
    assert res.status_code == 204
    assert api.get(f"/api/v1/journal/{day}").status_code == 404


def test_journal_validation_and_future_limit(api):
    assert api.put(f"/api/v1/journal/{ago(0)}", {"mood": 6}).status_code == 422
    tomorrow = (today() + timedelta(days=1)).isoformat()
    assert api.put(f"/api/v1/journal/{tomorrow}", {"tomorrow_priorities": "Plan"}).status_code == 201  # planning tonight is fine
    far = (today() + timedelta(days=5)).isoformat()
    assert api.put(f"/api/v1/journal/{far}", {"body": "x"}).get_json()["error"]["code"] == "rule_violation"


def test_journal_list_search_and_mood_stats(api):
    api.put(f"/api/v1/journal/{ago(2)}", {"body": "Studied firewall rules", "mood": 3})
    api.put(f"/api/v1/journal/{ago(1)}", {"lessons": "复习密码学很有用", "mood": 5, "energy": 4})
    items = api.get("/api/v1/journal").get_json()["items"]
    assert [i["entry_date"] for i in items] == [ago(1), ago(2)]
    assert items[0]["filled"] == ["lessons"] and items[0]["preview"].startswith("复习")
    assert [i["entry_date"] for i in api.get("/api/v1/journal?q=FIREWALL").get_json()["items"]] == [ago(2)]
    assert [i["entry_date"] for i in api.get("/api/v1/journal?q=密码学").get_json()["items"]] == [ago(1)]
    stats = api.get("/api/v1/journal/stats/mood").get_json()
    assert stats["average_mood"] == 4.0 and stats["days_with_mood"] == 2


def test_journal_text_never_reaches_the_logs(api, caplog):
    secret = "my private thought 7f3a"
    with caplog.at_level(logging.DEBUG):
        api.put(f"/api/v1/journal/{ago(0)}", {"body": secret})
        api.put(f"/api/v1/journal/{ago(0)}", {"body": secret * 2000})  # too long → validation error
        api.get(f"/api/v1/journal?q={secret}")
    assert secret not in caplog.text


def test_journal_is_private(app, api):
    from app.modules.auth.service import create_user
    from tests.conftest import TEST_PASSWORD, ApiClient

    api.put(f"/api/v1/journal/{ago(0)}", {"body": "mine"})
    create_user("other@example.test", TEST_PASSWORD, "Other")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    assert other.get(f"/api/v1/journal/{ago(0)}").status_code == 404
    assert other.get("/api/v1/journal").get_json()["items"] == []


# ---------- activity logs ----------

def test_activity_from_times_and_from_duration(api):
    start = datetime.combine(today(), datetime.min.time(), KL).replace(hour=9)
    a = api.post("/api/v1/activity-logs", {"title": "CCNA lab", "started_at": start.isoformat(),
                                           "ended_at": (start + timedelta(minutes=95)).isoformat()}).get_json()
    assert a["duration_minutes"] == 95 and a["log_date"] == today().isoformat()
    b = api.post("/api/v1/activity-logs", {"title": "Reading", "duration_minutes": 30, "log_date": ago(1)}).get_json()
    assert b["log_date"] == ago(1)
    bad = api.post("/api/v1/activity-logs", {"title": "x", "started_at": start.isoformat(),
                                             "ended_at": (start + timedelta(minutes=60)).isoformat(), "duration_minutes": 90})
    assert bad.status_code == 422
    assert api.post("/api/v1/activity-logs", {"title": "x"}).status_code == 422  # no duration, no times


def test_activity_summary_learning_minutes(api):
    cats = {c["name"]: c for c in api.get("/api/v1/categories").get_json()["items"]}
    api.post("/api/v1/activity-logs", {"title": "Python", "duration_minutes": 60, "category_id": cats["Programming"]["id"]})
    api.post("/api/v1/activity-logs", {"title": "Gym", "duration_minutes": 45, "category_id": cats["Health"]["id"]})
    api.post("/api/v1/activity-logs", {"title": "Misc", "duration_minutes": 15})
    s = api.get(f"/api/v1/activity-logs/summary?start={ago(6)}&end={ago(0)}").get_json()
    assert (s["total_minutes"], s["learning_minutes"]) == (120, 60)
    assert [c["minutes"] for c in s["by_category"]] == [60, 45, 15]


def test_activity_edit_and_task_tracked_minutes(api):
    task = api.post("/api/v1/tasks", {"title": "Essay", "status": "todo"}).get_json()
    a = api.post("/api/v1/activity-logs", {"title": "Essay", "duration_minutes": 40, "task_id": task["id"]}).get_json()
    api.patch(f"/api/v1/activity-logs/{a['id']}", {"duration_minutes": 50})
    assert api.get(f"/api/v1/tasks/{task['id']}").get_json()["tracked_minutes"] == 50
    assert api.delete(f"/api/v1/activity-logs/{a['id']}").status_code == 204
    assert api.get(f"/api/v1/tasks/{task['id']}").get_json()["tracked_minutes"] == 0


# ---------- focus sessions ----------

class Clock:
    def __init__(self):
        self.now = datetime(2026, 10, 20, 2, 0, tzinfo=timezone.utc)  # 10:00 in Kuala Lumpur

    def __call__(self):
        return self.now

    def advance(self, minutes):
        self.now += timedelta(minutes=minutes)


@pytest.fixture
def clock(monkeypatch):
    c = Clock()
    monkeypatch.setattr(activity_service, "utcnow", c)
    return c


def test_focus_session_with_pause_completes_and_logs_time(api, clock):
    task = api.post("/api/v1/tasks", {"title": "Subnetting", "status": "todo"}).get_json()
    s = api.post("/api/v1/focus-sessions", {"planned_minutes": 25, "task_id": task["id"]}).get_json()
    assert s["state"] == "running" and s["task_title"] == "Subnetting"
    clock.advance(10)
    api.post(f"/api/v1/focus-sessions/{s['id']}/pause")
    clock.advance(30)  # paused time doesn't count
    paused = api.get("/api/v1/focus-sessions/current").get_json()["session"]
    assert paused["state"] == "paused" and paused["focused_seconds"] == 600
    api.post(f"/api/v1/focus-sessions/{s['id']}/resume")
    clock.advance(12)
    done = api.post(f"/api/v1/focus-sessions/{s['id']}/stop", {}).get_json()
    assert (done["actual_minutes"], done["state"]) == (22, "completed")  # 22 ≥ 80% of 25
    logs = api.get(f"/api/v1/activity-logs?task_id={task['id']}").get_json()["items"]
    assert [(l["duration_minutes"], l["focus_session_id"]) for l in logs] == [(22, s["id"])]
    assert api.get("/api/v1/focus-sessions/current").get_json()["session"] is None


def test_short_session_is_interrupted_unless_marked(api, clock):
    s = api.post("/api/v1/focus-sessions", {"planned_minutes": 25, "label": "Reading"}).get_json()
    clock.advance(10)
    stopped = api.post(f"/api/v1/focus-sessions/{s['id']}/stop", {}).get_json()
    assert stopped["state"] == "interrupted" and stopped["actual_minutes"] == 10
    s2 = api.post("/api/v1/focus-sessions", {"planned_minutes": 25}).get_json()
    clock.advance(10)
    marked = api.post(f"/api/v1/focus-sessions/{s2['id']}/stop", {"mark_complete": True}).get_json()
    assert marked["state"] == "completed"
    summary = api.get("/api/v1/focus-sessions?start=2026-10-20&end=2026-10-20").get_json()
    assert (summary["completed_count"], summary["interrupted_count"], summary["focused_minutes"]) == (1, 1, 20)


def test_only_one_session_at_a_time_and_correction(api, clock):
    s = api.post("/api/v1/focus-sessions", {"planned_minutes": 30}).get_json()
    assert api.post("/api/v1/focus-sessions", {"planned_minutes": 30}).status_code == 409
    assert api.patch(f"/api/v1/focus-sessions/{s['id']}", {"actual_minutes": 5}).get_json()["error"]["code"] == "rule_violation"
    clock.advance(30)
    api.post(f"/api/v1/focus-sessions/{s['id']}/stop", {})
    # Correct the minutes later (e.g. you forgot to stop it); the activity log follows
    api.patch(f"/api/v1/focus-sessions/{s['id']}", {"actual_minutes": 20})
    assert [l["duration_minutes"] for l in api.get("/api/v1/activity-logs").get_json()["items"]] == [20]
    api.patch(f"/api/v1/focus-sessions/{s['id']}", {"actual_minutes": 0})
    assert api.get("/api/v1/activity-logs").get_json()["items"] == []


def test_zero_minute_session_creates_no_log(api, clock):
    s = api.post("/api/v1/focus-sessions", {"planned_minutes": 25}).get_json()
    clock.advance(0.5)
    api.post(f"/api/v1/focus-sessions/{s['id']}/stop", {})
    assert api.get("/api/v1/activity-logs").get_json()["items"] == []
