"""Insights tests. Data is placed in LAST week (offset=-1), which is entirely in the past, so every expected number
below can be worked out by hand and doesn't depend on which weekday the tests run."""

from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from sqlalchemy import text

from app.extensions import db

KL = ZoneInfo("Asia/Kuala_Lumpur")


def last_week() -> list[date]:
    today = datetime.now(KL).date()
    monday = today - timedelta(days=today.weekday()) - timedelta(weeks=1)
    return [monday + timedelta(days=i) for i in range(7)]


def overview(api, period="week", offset=-1):
    res = api.get(f"/api/v1/insights/overview?period={period}&offset={offset}")
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def comp(o, key):
    return next(c for c in o["score"]["components"] if c["key"] == key)


def at(d, hh):
    return datetime.combine(d, time(hh), KL).isoformat()


def complete_at(app, task_id, when_iso):
    """Back-date a completion (the API always stamps 'now')."""
    with app.app_context():
        db.session.execute(text("UPDATE tasks SET status='done', completed_at=:c WHERE id=:i"), {"c": when_iso, "i": task_id})
        db.session.commit()


# ---------- empty account ----------

def test_no_data_is_never_zero(api):
    o = overview(api)
    assert o["score"]["value"] is None and o["score"]["coverage"] == 0.0
    assert all(not c["has_data"] and c["score"] is None for c in o["score"]["components"])
    assert o["components"]["goals_learning"]["learning_minutes"] == 0  # a real zero, but no target → no score


# ---------- tasks ----------

def test_task_execution_counts_on_time_late_and_missed(app, api):
    week = last_week()
    ids = []
    for title in ("on time", "late", "missed", "subtask parent"):
        ids.append(api.post("/api/v1/tasks", {"title": title, "status": "todo", "due_date": week[2].isoformat()}).get_json()["id"])
    complete_at(app, ids[0], at(week[2], 10))  # same day → on time
    complete_at(app, ids[1], at(week[4], 10))  # two days late
    complete_at(app, ids[3], at(week[1], 9))   # early → on time
    api.post("/api/v1/tasks", {"title": "child", "status": "todo", "parent_task_id": ids[3]})  # subtasks don't count
    api.post("/api/v1/tasks", {"title": "no date", "status": "todo"})  # undated tasks don't count
    t = overview(api)["components"]["tasks"]
    assert (t["due"], t["on_time"], t["late"], t["missed"]) == (4, 2, 1, 1)
    assert t["score"] == 50.0


def test_deadline_counts_by_its_local_day(app, api):
    week = last_week()
    tid = api.post("/api/v1/tasks", {"title": "form", "status": "todo", "deadline": at(week[3], 17)}).get_json()["id"]
    complete_at(app, tid, at(week[3], 18))  # an hour after the deadline → late
    t = overview(api)["components"]["tasks"]
    assert (t["due"], t["late"]) == (1, 1) and t["score"] == 0.0


# ---------- habits ----------

def test_habit_rate_uses_streak_rules(api):
    week = last_week()
    h = api.post("/api/v1/habits", {"name": "Read", "start_date": week[0].isoformat()}).get_json()
    for i, state in enumerate(["done", "done", "skipped", "done", None, "done", None]):
        if state:
            api.put(f"/api/v1/habits/{h['id']}/logs/{week[i].isoformat()}", {"state": state})
    hb = overview(api)["components"]["habits"]
    # 4 done, 1 skipped (left out), 2 missed → 4 / 6
    assert (hb["done"], hb["eligible"]) == (4, 6) and hb["score"] == 66.7
    assert [d["rate"] for d in hb["daily"]][:3] == [100.0, 100.0, None]


def test_weekly_target_habit_counts_capped_completions(api):
    week = last_week()
    h = api.post("/api/v1/habits", {"name": "Run", "schedule_type": "x_per_week", "times_per_week": 3,
                                    "start_date": week[0].isoformat()}).get_json()
    for i in (0, 2):
        api.put(f"/api/v1/habits/{h['id']}/logs/{week[i].isoformat()}", {"state": "done"})
    hb = overview(api)["components"]["habits"]
    assert (hb["done"], hb["eligible"]) == (2, 3)


# ---------- learning & goals ----------

def test_learning_needs_a_target_and_is_prorated(api):
    week = last_week()
    cats = {c["name"]: c["id"] for c in api.get("/api/v1/categories").get_json()["items"]}
    api.post("/api/v1/activity-logs", {"title": "Python", "duration_minutes": 120, "category_id": cats["Programming"], "log_date": week[1].isoformat()})
    api.post("/api/v1/activity-logs", {"title": "Gym", "duration_minutes": 60, "category_id": cats["Health"], "log_date": week[1].isoformat()})
    gl = overview(api)["components"]["goals_learning"]
    assert gl["learning_minutes"] == 120 and gl["score"] is None  # no target yet
    api.patch("/api/v1/settings", {"weekly_learning_target_min": 300})
    gl = overview(api)["components"]["goals_learning"]
    assert (gl["learning_target_minutes"], gl["learning_rate"], gl["score"]) == (300, 40.0, 40.0)


def test_goal_on_track_compares_progress_with_time_elapsed(app, api):
    week = last_week()
    today = datetime.now(KL).date()
    # Started 10 days before the end of last week, target 10 days after → half the time had elapsed by then.
    g = api.post("/api/v1/goals", {"title": "Exam", "progress_mode": "manual",
                                   "start_date": (week[6] - timedelta(days=10)).isoformat(),
                                   "target_date": (week[6] + timedelta(days=10)).isoformat()}).get_json()
    api.post(f"/api/v1/goals/{g['id']}/updates", {"progress": 25})
    gl = overview(api)["components"]["goals_learning"]
    assert gl["goals"][0]["expected"] == 50.0 and gl["goals"][0]["on_track"] == 50.0
    assert gl["score"] == 50.0  # only the goal part has data
    assert today > week[6]


# ---------- wellbeing ----------

def test_wellbeing_needs_three_check_in_days(api):
    week = last_week()
    api.put(f"/api/v1/journal/{week[0].isoformat()}", {"mood": 5, "energy": 3})  # day value 4
    api.put(f"/api/v1/journal/{week[1].isoformat()}", {"mood": 3})                # day value 3
    assert overview(api)["components"]["wellbeing"]["score"] is None
    api.put(f"/api/v1/journal/{week[2].isoformat()}", {"energy": 2})              # day value 2
    w = overview(api)["components"]["wellbeing"]
    # average 3 on a 1–5 scale → 50
    assert (w["check_in_days"], w["score"], w["average_mood"], w["average_energy"]) == (3, 50.0, 4.0, 2.5)


# ---------- the score ----------

def test_score_reweights_over_components_with_data(app, api):
    week = last_week()
    tid = api.post("/api/v1/tasks", {"title": "t", "status": "todo", "due_date": week[1].isoformat()}).get_json()["id"]
    complete_at(app, tid, at(week[1], 9))  # tasks = 100
    h = api.post("/api/v1/habits", {"name": "h", "start_date": week[0].isoformat()}).get_json()
    for i in range(7):
        if i % 2 == 0:
            api.put(f"/api/v1/habits/{h['id']}/logs/{week[i].isoformat()}", {"state": "done"})  # 4/7
    o = overview(api)
    habits = o["components"]["habits"]["score"]
    assert habits == 57.1
    # tasks weight 30, habits 30 → plain average; coverage = 60 / 100
    assert o["score"]["value"] == round((30 * 100 + 30 * habits) / 60, 1)
    assert o["score"]["coverage"] == 60.0
    assert comp(o, "tasks")["effective_weight"] == 50.0 and comp(o, "wellbeing")["effective_weight"] == 0.0


def test_custom_weights_and_disabled_components(app, api):
    week = last_week()
    tid = api.post("/api/v1/tasks", {"title": "t", "status": "todo", "due_date": week[1].isoformat()}).get_json()["id"]
    complete_at(app, tid, at(week[1], 9))
    h = api.post("/api/v1/habits", {"name": "h", "start_date": week[6].isoformat()}).get_json()  # 1 missed day → 0
    res = api.patch("/api/v1/settings", {"score_weights": {"tasks": 10, "goals_learning": 25, "habits": 30, "wellbeing": 15}})
    assert res.status_code == 200
    o = overview(api)
    assert o["score"]["value"] == round((10 * 100 + 30 * 0) / 40, 1)
    api.patch("/api/v1/settings", {"score_weights": {"tasks": 10, "goals_learning": 25, "habits": 30, "wellbeing": 15,
                                                     "enabled": {"habits": False}}})
    o = overview(api)
    assert o["score"]["value"] == 100.0 and not comp(o, "habits")["enabled"]
    assert o["score"]["coverage"] == round(100 * 10 / 50, 1)
    assert h["id"]


def test_weights_and_layout_validation(api):
    bad = [{"tasks": 101}, {"tasks": "30"}, {"focus": 10}, {"tasks": 0, "goals_learning": 0, "habits": 0, "wellbeing": 0},
           {"enabled": {"tasks": False, "goals_learning": False, "habits": False, "wellbeing": False}}]
    for w in bad:
        assert api.patch("/api/v1/settings", {"score_weights": w}).status_code == 422, w
    assert api.patch("/api/v1/settings", {"dashboard_layout": [{"key": "nope", "visible": True}]}).status_code == 422
    assert api.patch("/api/v1/settings", {"dashboard_layout": [{"key": "tasks", "visible": True}] * 2}).status_code == 422
    ok = api.patch("/api/v1/settings", {"dashboard_layout": [{"key": "habits", "visible": False}, {"key": "tasks", "visible": True}]}).get_json()
    keys = [x["key"] for x in ok["dashboard_layout"]]
    assert keys[:2] == ["habits", "tasks"] and len(keys) == 8  # unknown/new sections are appended
    assert api.patch("/api/v1/settings", {"weekly_learning_target_min": 0}).get_json()["weekly_learning_target_min"] is None


# ---------- consistency with the raw data ----------

def test_time_allocation_matches_raw_sql(app, api):
    week = last_week()
    cats = {c["name"]: c["id"] for c in api.get("/api/v1/categories").get_json()["items"]}
    for i, (cat, mins) in enumerate([("Programming", 50), ("Reading", 25), ("Programming", 35), (None, 10)]):
        body = {"title": f"a{i}", "duration_minutes": mins, "log_date": week[i].isoformat()}
        if cat:
            body["category_id"] = cats[cat]
        api.post("/api/v1/activity-logs", body)
    t = overview(api)["time"]
    with app.app_context():
        raw = db.session.execute(text(
            "SELECT coalesce(sum(duration_minutes), 0) FROM activity_logs WHERE log_date BETWEEN :a AND :b"
        ), {"a": week[0], "b": week[6]}).scalar()
    assert t["total_minutes"] == raw == 120
    assert [(c["name"], c["minutes"]) for c in t["by_category"]] == [("Programming", 85), ("Reading", 25), (None, 10)]


def test_previous_period_and_month_and_trend(api):
    o = overview(api, offset=0)
    assert o["previous"]["period"]["end"] == (date.fromisoformat(o["period"]["start"]) - timedelta(days=1)).isoformat()
    m = overview(api, period="month", offset=0)
    assert m["period"]["start"].endswith("-01")
    weeks = api.get("/api/v1/insights/trend?weeks=4").get_json()["weeks"]
    assert len(weeks) == 4 and all(w["score"] is None for w in weeks)
    assert api.get("/api/v1/insights/overview?offset=1").status_code == 422  # no future periods


def test_goal_that_has_not_started_is_not_scored(api):
    week = last_week()
    g = api.post("/api/v1/goals", {"title": "Later", "progress_mode": "manual",
                                   "start_date": (week[6] + timedelta(days=1)).isoformat(),
                                   "target_date": (week[6] + timedelta(days=30)).isoformat()}).get_json()
    api.post(f"/api/v1/goals/{g['id']}/updates", {"progress": 10})
    gl = overview(api)["components"]["goals_learning"]
    assert gl["goals"] == [] and gl["goals_on_track"] is None and gl["score"] is None
