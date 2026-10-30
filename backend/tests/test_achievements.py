"""Achievements are worked out from history: these check the counting rules and the unlock days."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

KL = ZoneInfo("Asia/Kuala_Lumpur")


def ok(res):
    assert res.status_code in (200, 201), res.get_json()
    return res.get_json()


def by_key(api):
    return {i["key"]: i for i in ok(api.get("/api/v1/achievements"))["items"]}


def test_a_new_account_has_everything_locked_with_zero_progress(api):
    data = ok(api.get("/api/v1/achievements"))
    assert data["unlocked"] == 0 and data["total"] == len(data["items"]) >= 20
    assert all(not i["unlocked"] and i["progress"] == 0 and i["unlocked_on"] is None for i in data["items"])


def test_tasks_focus_and_journal_unlock_on_the_day_they_were_reached(api):
    today = datetime.now(KL).date().isoformat()
    for n in range(10):
        task = ok(api.post("/api/v1/tasks", {"title": f"Task {n}", "status": "todo"}))
        ok(api.post(f"/api/v1/tasks/{task['id']}/complete"))
    focus = ok(api.post("/api/v1/focus-sessions", {"planned_minutes": 25}))
    ok(api.post(f"/api/v1/focus-sessions/{focus['id']}/stop", {}))
    ok(api.patch(f"/api/v1/focus-sessions/{focus['id']}", {"actual_minutes": 75}))
    ok(api.put(f"/api/v1/journal/{today}", {"body": "A good day"}))

    a = by_key(api)
    assert a["first_task"]["unlocked"] and a["first_task"]["unlocked_on"] == today
    assert a["tasks_10"]["unlocked"] and not a["tasks_50"]["unlocked"]
    assert a["tasks_50"]["progress"] == 10 and a["tasks_50"]["target"] == 50
    assert a["focus_1h"]["unlocked"] and a["focus_10h"]["progress"] == 75
    assert a["journal_7"]["progress"] == 1 and not a["journal_7"]["unlocked"]


def test_a_sealed_day_unlocks_the_first_seal(api):
    d = datetime.now(KL).date()
    habit = ok(api.post("/api/v1/habits", {"name": "Walk", "start_date": d.isoformat()}))
    task = ok(api.post("/api/v1/tasks", {"title": "One", "status": "todo"}))
    ok(api.post(f"/api/v1/tasks/{task['id']}/complete"))
    ok(api.put(f"/api/v1/habits/{habit['id']}/logs/{d.isoformat()}", {"state": "done"}))
    focus = ok(api.post("/api/v1/focus-sessions", {"planned_minutes": 15}))
    ok(api.post(f"/api/v1/focus-sessions/{focus['id']}/stop", {}))
    ok(api.patch(f"/api/v1/focus-sessions/{focus['id']}", {"actual_minutes": 15}))

    a = by_key(api)
    assert a["first_seal"]["unlocked"] and a["first_seal"]["unlocked_on"] == d.isoformat()
    assert a["seals_3"]["progress"] == 1


def test_habit_streaks_count_the_best_daily_streak(api):
    d = datetime.now(KL).date()
    start = d - timedelta(days=7)
    habit = ok(api.post("/api/v1/habits", {"name": "Read", "start_date": start.isoformat()}))
    for i in range(7):
        ok(api.put(f"/api/v1/habits/{habit['id']}/logs/{(start + timedelta(days=i)).isoformat()}", {"state": "done"}))
    a = by_key(api)
    assert a["habit_7"]["unlocked"] and a["habit_7"]["unlocked_on"] is None
    assert a["habit_30"]["progress"] == 7
