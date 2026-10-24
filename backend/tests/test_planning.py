"""Planning (replaces the AI assistant): Plan my day ranks and schedules your own tasks by fixed rules; the weekly
review summarises the week and saves your reflection. Also the readable PDF report in Backup."""

from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

KL = ZoneInfo("Asia/Kuala_Lumpur")
DAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


def ok(res, status=(200, 201)):
    assert res.status_code in ((status,) if isinstance(status, int) else status), res.get_json()
    return res.get_json()


def today():
    return datetime.now(KL).date()


def at(d, hh, mm=0):
    return datetime.combine(d, time(hh, mm), KL)


def setup_hours(api, hours):
    ok(api.patch("/api/v1/settings", {"timezone": "Asia/Kuala_Lumpur", "working_hours": {d: hours for d in DAYS}}))


def test_ai_endpoints_are_gone(api):
    assert api.get("/api/v1/ai/status").status_code == 404
    assert api.post("/api/v1/ai/daily-plan", {}).status_code == 404
    assert api.post("/api/v1/ai/weekly-review", {}).status_code == 404
    assert "ai_enabled" not in ok(api.get("/api/v1/settings"))


def test_day_plan_ranks_urgent_first_and_suggests_a_short_list(api):
    setup_hours(api, [["00:00", "23:59"]])
    d = today()
    late = ok(api.post("/api/v1/tasks", {"title": "Late report", "due_date": (d - timedelta(days=2)).isoformat()}))
    due = ok(api.post("/api/v1/tasks", {"title": "Pay rent", "due_date": d.isoformat()}))
    ok(api.post("/api/v1/tasks", {"title": "Someday idea", "priority": 4}))  # not worth planning today
    ok(api.post("/api/v1/tasks", {"title": "Big launch", "priority": 1}))
    ok(api.post("/api/v1/tasks", {"title": "Next week thing", "due_date": (d + timedelta(days=5)).isoformat()}))
    done = ok(api.post("/api/v1/tasks", {"title": "Already done", "due_date": d.isoformat()}))
    ok(api.post(f"/api/v1/tasks/{done['id']}/complete"))

    plan = ok(api.get("/api/v1/planning/day?day=today"))
    titles = [c["task"]["title"] for c in plan["candidates"]]
    assert titles[:2] == ["Late report", "Pay rent"]
    assert "Someday idea" not in titles and "Already done" not in titles
    assert plan["candidates"][0]["reasons"][0] == "overdue"
    assert plan["suggested"][:2] == [late["id"], due["id"]] and len(plan["suggested"]) == 3
    assert plan["is_today"] is True


def test_a_task_already_blocked_today_is_marked_and_not_suggested(api):
    setup_hours(api, [["00:00", "23:59"]])
    d = today() + timedelta(days=1)
    t = ok(api.post("/api/v1/tasks", {"title": "Draft", "due_date": d.isoformat()}))
    ok(api.post("/api/v1/calendar/events", {"title": "Draft", "kind": "task_block", "task_id": t["id"],
                                            "starts_at": at(d, 9).isoformat(), "ends_at": at(d, 10).isoformat()}))
    plan = ok(api.get("/api/v1/planning/day?day=tomorrow"))
    assert plan["candidates"][0]["scheduled"] is True
    assert t["id"] not in plan["suggested"]


def test_schedule_fills_free_time_in_order_around_fixed_events(api):
    setup_hours(api, [["09:00", "12:00"]])
    d = today() + timedelta(days=1)
    ok(api.post("/api/v1/calendar/events", {"title": "Dentist", "is_hard": True,
                                            "starts_at": at(d, 10).isoformat(), "ends_at": at(d, 11).isoformat()}))
    a = ok(api.post("/api/v1/tasks", {"title": "A", "estimate_minutes": 60}))
    b = ok(api.post("/api/v1/tasks", {"title": "B"}))  # no estimate → 45 minutes
    c = ok(api.post("/api/v1/tasks", {"title": "C", "estimate_minutes": 120}))  # no 2-hour gap left
    res = ok(api.post("/api/v1/planning/day/schedule", {"day": "tomorrow", "task_ids": [a["id"], b["id"], c["id"]]}))
    blocks = {x["title"]: x for x in res["blocks"]}
    assert datetime.fromisoformat(blocks["A"]["starts_at"]) == at(d, 9)
    assert datetime.fromisoformat(blocks["A"]["ends_at"]) == at(d, 10)
    assert datetime.fromisoformat(blocks["B"]["starts_at"]) == at(d, 11)
    assert blocks["B"]["minutes"] == 45 and blocks["B"]["estimated"] is False
    assert res["unplaced"] == [c["id"]]


def test_schedule_ignores_other_peoples_and_finished_tasks(app, api):
    from app.modules.auth.service import create_user
    from tests.conftest import TEST_PASSWORD, ApiClient

    setup_hours(api, [["00:00", "23:59"]])
    create_user("other@example.test", TEST_PASSWORD, "Other", "en")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    theirs = ok(other.post("/api/v1/tasks", {"title": "Not yours"}))
    res = ok(api.post("/api/v1/planning/day/schedule", {"day": "tomorrow", "task_ids": [theirs["id"]]}))
    assert res == {"date": res["date"], "blocks": [], "unplaced": []}


def test_weekly_review_summarises_and_saves_a_reflection(api):
    d = today()
    monday = d - timedelta(days=d.weekday())
    t = ok(api.post("/api/v1/tasks", {"title": "Finish slides", "due_date": d.isoformat()}))
    ok(api.post(f"/api/v1/tasks/{t['id']}/complete"))
    ok(api.post("/api/v1/tasks", {"title": "Call bank", "due_date": (monday - timedelta(days=1)).isoformat()}))

    week = ok(api.get("/api/v1/planning/week?week=this"))
    assert week["week"]["start"] == monday.isoformat()
    assert [x["title"] for x in week["completed"]] == ["Finish slides"]
    assert [x["title"] for x in week["carry_over"]] == ["Call bank"]
    assert week["review"] is None

    saved = ok(api.put(f"/api/v1/planning/reviews/{monday.isoformat()}",
                       {"went_well": " Finished slides ", "priorities": ["Gym", " ", "Read"], "completed": True}))
    assert saved["went_well"] == "Finished slides" and saved["priorities"] == ["Gym", "Read"]
    assert saved["completed_at"] is not None
    assert ok(api.get("/api/v1/planning/week?week=this"))["review"]["id"] == saved["id"]
    assert ok(api.get("/api/v1/planning/reviews"))["items"][0]["week_start"] == monday.isoformat()

    # Next week sees these as last week's priorities
    later = ok(api.put(f"/api/v1/planning/reviews/{monday.isoformat()}", {"lesson": "Plan Mondays"}))
    assert later["went_well"] == "Finished slides"  # untouched fields stay


def test_review_rules(api):
    d = today()
    monday = d - timedelta(days=d.weekday())
    assert api.put(f"/api/v1/planning/reviews/{(monday + timedelta(days=1)).isoformat()}", {}).status_code == 422
    assert api.put(f"/api/v1/planning/reviews/{(monday + timedelta(days=7)).isoformat()}", {}).status_code == 422
    assert api.put(f"/api/v1/planning/reviews/{monday.isoformat()}", {"priorities": ["a", "b", "c", "d"]}).status_code == 422
    assert api.put("/api/v1/planning/reviews/not-a-date", {}).status_code == 404


def test_planning_requires_login(anon):
    assert anon.get("/api/v1/planning/day").status_code == 401
    assert anon.get("/api/v1/planning/week").status_code == 401
    assert anon.get("/api/v1/backup/export/report.pdf").status_code == 401


def test_pdf_report_is_a_real_pdf_and_handles_chinese(api):
    ok(api.post("/api/v1/tasks", {"title": "写报告 and review", "due_date": today().isoformat()}))
    ok(api.put(f"/api/v1/journal/{today().isoformat()}", {"body": "今天很好\nGood day", "mood": 4}))
    ok(api.post("/api/v1/goals", {"title": "Learn guitar"}))
    res = api.get("/api/v1/backup/export/report.pdf")
    assert res.status_code == 200
    assert res.mimetype == "application/pdf"
    assert res.data.startswith(b"%PDF") and len(res.data) > 2000
    assert "life-os-report-" in res.headers["Content-Disposition"]
