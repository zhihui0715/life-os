"""Calendar tests. Dates are always a few days in the future (so "from now on" rules don't interfere),
and working hours are set explicitly so results don't depend on defaults."""

from datetime import date, datetime, time, timedelta
from urllib.parse import quote
from zoneinfo import ZoneInfo

import pytest

from tests.conftest import TEST_PASSWORD, ApiClient

KL = ZoneInfo("Asia/Kuala_Lumpur")
EVERY_DAY_9_TO_12 = {d: [["09:00", "12:00"]] for d in ("mon", "tue", "wed", "thu", "fri", "sat", "sun")}


def day(offset: int) -> date:
    return datetime.now(KL).date() + timedelta(days=offset)


def at(d: date, hh: int, mm: int = 0, tz=KL) -> str:
    return datetime.combine(d, time(hh, mm), tz).isoformat()


def rng(d_from: date, d_to: date, tz=KL) -> str:
    """Query string for [d_from 00:00, d_to 00:00) local."""
    return f"start={quote(at(d_from, 0, tz=tz))}&end={quote(at(d_to, 0, tz=tz))}"


def event(api, **fields):
    res = api.post("/api/v1/calendar/events", {"title": "Event", **fields})
    assert res.status_code == 201, res.get_json()
    return res.get_json()


def occs(api, d_from, d_to, tz=KL):
    return api.get(f"/api/v1/calendar/occurrences?{rng(d_from, d_to, tz)}").get_json()


def utc_local(iso: str, tz=KL) -> str:
    return datetime.fromisoformat(iso).astimezone(tz).strftime("%Y-%m-%d %H:%M")


@pytest.fixture
def hours(api):
    assert api.patch("/api/v1/settings", {"working_hours": EVERY_DAY_9_TO_12}).status_code == 200


# ---------- events & occurrences ----------

def test_timed_event_round_trip(api):
    d = day(3)
    e = event(api, title="Dentist", starts_at=at(d, 14), ends_at=at(d, 15))
    assert e["kind"] == "appointment" and e["is_hard"] is True and e["tzid"] == "Asia/Kuala_Lumpur"
    items = occs(api, d, d + timedelta(days=1))["items"]
    assert [(o["title"], utc_local(o["starts_at"])) for o in items] == [("Dentist", f"{d} 14:00")]


def test_all_day_event_uses_local_dates(api):
    d = day(3)
    e = event(api, title="Trip", all_day=True, start_date=d.isoformat(), end_date=(d + timedelta(days=2)).isoformat())
    assert (e["start_date"], e["end_date"]) == (d.isoformat(), (d + timedelta(days=2)).isoformat())
    assert utc_local(e["starts_at"]) == f"{d} 00:00"  # stored as local midnight
    item = occs(api, d + timedelta(days=1), d + timedelta(days=2))["items"][0]
    assert item["all_day"] and item["start_date"] == d.isoformat()


@pytest.mark.parametrize("body", [
    {"starts_at": "2026-12-01T10:00:00+08:00", "ends_at": "2026-12-01T09:00:00+08:00"},  # ends before start
    {"starts_at": "2026-12-01T10:00:00", "ends_at": "2026-12-01T11:00:00"},  # no timezone offset
    {"all_day": True, "starts_at": "2026-12-01T10:00:00+08:00", "ends_at": "2026-12-01T11:00:00+08:00"},
    {"kind": "task_block", "starts_at": "2026-12-01T10:00:00+08:00", "ends_at": "2026-12-01T11:00:00+08:00"},
    {"rrule": "FREQ=HOURLY", "starts_at": "2026-12-01T10:00:00+08:00", "ends_at": "2026-12-01T11:00:00+08:00"},
])
def test_event_validation(api, body):
    assert api.post("/api/v1/calendar/events", {"title": "x", **body}).status_code == 422


def test_weekly_recurrence_and_series_end(api):
    d = day(3)
    e = event(api, title="Class", starts_at=at(d, 9), ends_at=at(d, 10), rrule="FREQ=WEEKLY;COUNT=3")
    items = occs(api, d, d + timedelta(days=30))["items"]
    assert [utc_local(o["starts_at"]) for o in items] == [f"{d + timedelta(weeks=w)} 09:00" for w in range(3)]
    assert all(o["recurring"] for o in items)
    detail = api.get(f"/api/v1/calendar/events/{e['id']}").get_json()
    assert detail["rrule"] == "FREQ=WEEKLY;COUNT=3"


def test_forever_series_reaches_far_future(api):
    d = day(3)
    event(api, title="Daily", starts_at=at(d, 7), ends_at=at(d, 8), rrule="FREQ=DAILY")
    far = d + timedelta(days=400)
    assert len(occs(api, far, far + timedelta(days=7))["items"]) == 7


def test_recurrence_keeps_wall_clock_time_across_dst(api):
    ny = ZoneInfo("America/New_York")
    api.patch("/api/v1/settings", {"timezone": "America/New_York"})
    year = datetime.now(ny).year + 1
    start = date(year, 10, 25)  # DST ends in early November
    event(api, title="Gym", starts_at=at(start, 9, tz=ny), ends_at=at(start, 10, tz=ny), rrule="FREQ=WEEKLY;COUNT=3")
    items = occs(api, start, start + timedelta(days=21), tz=ny)["items"]
    assert [utc_local(o["starts_at"], ny)[-5:] for o in items] == ["09:00", "09:00", "09:00"]
    offsets = {datetime.fromisoformat(o["starts_at"]).hour for o in items}
    assert len(offsets) == 2  # the UTC hour changes, the local hour doesn't


def test_edit_cancel_and_restore_one_occurrence(api):
    d = day(3)
    e = event(api, title="Standup", starts_at=at(d, 9), ends_at=at(d, 10), rrule="FREQ=DAILY;COUNT=3")
    second = occs(api, d, d + timedelta(days=5))["items"][1]
    ref = f"/api/v1/calendar/events/{e['id']}/occurrence?original_start={quote(second['original_start'])}"

    moved = api.patch(ref, {"starts_at": at(d + timedelta(days=1), 11), "ends_at": at(d + timedelta(days=1), 12), "title": "Late standup"})
    assert moved.status_code == 200 and moved.get_json()["is_exception"]
    items = occs(api, d, d + timedelta(days=5))["items"]
    assert [(o["title"], utc_local(o["starts_at"])[-5:]) for o in items] == [
        ("Standup", "09:00"), ("Late standup", "11:00"), ("Standup", "09:00")]

    assert api.delete(ref).status_code == 204
    assert len(occs(api, d, d + timedelta(days=5))["items"]) == 2
    api.post(ref.replace("/occurrence?", "/occurrence/restore?"))
    assert len(occs(api, d, d + timedelta(days=5))["items"]) == 3


def test_occurrence_must_exist_and_event_must_repeat(api):
    d = day(3)
    series = event(api, starts_at=at(d, 9), ends_at=at(d, 10), rrule="FREQ=DAILY;COUNT=2")
    bogus = quote(at(d, 9, 30))
    assert api.delete(f"/api/v1/calendar/events/{series['id']}/occurrence?original_start={bogus}").status_code == 404
    single = event(api, starts_at=at(d, 13), ends_at=at(d, 14))
    res = api.delete(f"/api/v1/calendar/events/{single['id']}/occurrence?original_start={quote(single['starts_at'])}")
    assert res.get_json()["error"]["code"] == "rule_violation"


def test_series_edit_drops_single_occurrence_changes(api):
    d = day(3)
    e = event(api, starts_at=at(d, 9), ends_at=at(d, 10), rrule="FREQ=DAILY;COUNT=3")
    first = occs(api, d, d + timedelta(days=1))["items"][0]
    api.delete(f"/api/v1/calendar/events/{e['id']}/occurrence?original_start={quote(first['original_start'])}")
    res = api.patch(f"/api/v1/calendar/events/{e['id']}", {"starts_at": at(d, 8), "ends_at": at(d, 9)}).get_json()
    assert res["dropped_exceptions"] == 1 and res["exception_count"] == 0
    # renaming alone keeps them
    api.delete(f"/api/v1/calendar/events/{e['id']}/occurrence?original_start={quote(at(d, 8))}")
    res = api.patch(f"/api/v1/calendar/events/{e['id']}", {"title": "Renamed"}).get_json()
    assert res["dropped_exceptions"] == 0 and res["exception_count"] == 1


def test_archive_hides_event(api):
    d = day(3)
    e = event(api, starts_at=at(d, 9), ends_at=at(d, 10))
    api.post(f"/api/v1/calendar/events/{e['id']}/archive")
    assert occs(api, d, d + timedelta(days=1))["items"] == []


def test_task_markers_on_calendar(api):
    d = day(3)
    api.post("/api/v1/tasks", {"title": "Essay", "status": "todo", "due_date": d.isoformat()})
    api.post("/api/v1/tasks", {"title": "Form", "status": "todo", "deadline": at(d, 17)})
    markers = occs(api, d, d + timedelta(days=1))["tasks"]
    assert sorted((m["title"], m["kind"]) for m in markers) == [("Essay", "due"), ("Form", "deadline")]


def test_events_are_private(app, api):
    from app.modules.auth.service import create_user

    d = day(3)
    e = event(api, starts_at=at(d, 9), ends_at=at(d, 10))
    create_user("other@example.test", TEST_PASSWORD, "Other")
    other = ApiClient(app.test_client())
    other.login("other@example.test")
    assert other.get(f"/api/v1/calendar/events/{e['id']}").status_code == 404
    assert occs(other, d, d + timedelta(days=1))["items"] == []


# ---------- conflicts & free time ----------

def test_overlapping_appointments_are_a_hard_conflict(api):
    d = day(3)
    event(api, title="A", starts_at=at(d, 10), ends_at=at(d, 11))
    event(api, title="B", starts_at=at(d, 10, 30), ends_at=at(d, 12))
    overlaps = api.get(f"/api/v1/calendar/conflicts?{rng(d, d + timedelta(days=1))}").get_json()["overlaps"]
    assert len(overlaps) == 1
    assert overlaps[0]["severity"] == "hard" and overlaps[0]["overlap_minutes"] == 30
    assert overlaps[0]["suggestion"] is None  # fixed appointments are never offered a move


def test_preferences_and_all_day_events_never_conflict(api):
    d = day(3)
    event(api, title="Meeting", starts_at=at(d, 10), ends_at=at(d, 11))
    event(api, title="Study hours", kind="preference", starts_at=at(d, 9), ends_at=at(d, 12))
    event(api, title="Holiday", all_day=True, start_date=d.isoformat(), end_date=d.isoformat())
    assert api.get(f"/api/v1/calendar/conflicts?{rng(d, d + timedelta(days=1))}").get_json()["overlaps"] == []


def test_task_block_conflict_offers_a_free_slot(api, hours):
    d = day(3)
    task = api.post("/api/v1/tasks", {"title": "Revise", "status": "todo"}).get_json()
    event(api, title="Exam", starts_at=at(d, 9), ends_at=at(d, 10))
    event(api, title="Revise", kind="task_block", task_id=task["id"], starts_at=at(d, 9, 30), ends_at=at(d, 10, 30))
    item = api.get(f"/api/v1/calendar/conflicts?{rng(d, d + timedelta(days=1))}").get_json()["overlaps"][0]
    assert item["severity"] == "soft"
    s = item["suggestion"]
    assert s["occurrence"]["title"] == "Revise"
    assert (utc_local(s["starts_at"]), utc_local(s["ends_at"])) == (f"{d} 10:00", f"{d} 11:00")


def test_free_slots_respect_working_hours_and_busy_time(api, hours):
    d = day(3)
    event(api, title="Call", starts_at=at(d, 10), ends_at=at(d, 11))
    event(api, title="Lunch idea", kind="preference", starts_at=at(d, 11), ends_at=at(d, 12))  # not busy
    slots = api.get(f"/api/v1/calendar/free-slots?{rng(d, d + timedelta(days=1))}&min_minutes=30").get_json()["items"]
    assert [(utc_local(s["starts_at"])[-5:], utc_local(s["ends_at"])[-5:]) for s in slots] == [("09:00", "10:00"), ("11:00", "12:00")]


def test_working_hours_validation(api):
    bad = [{"mon": [["10:00", "09:00"]]}, {"mon": [["09:00", "12:00"], ["11:00", "13:00"]]}, {"funday": []}, {"mon": [["9am", "5pm"]]}]
    for wh in bad:
        assert api.patch("/api/v1/settings", {"working_hours": wh}).status_code == 422, wh


# ---------- workload & suggestions ----------

def test_deadline_at_risk_when_estimate_does_not_fit(api, hours):
    d = day(2)
    big = api.post("/api/v1/tasks", {"title": "Big report", "status": "todo", "estimate_minutes": 900, "deadline": at(d, 23)}).get_json()
    small = api.post("/api/v1/tasks", {"title": "Small fix", "status": "todo", "estimate_minutes": 30, "deadline": at(d, 23)}).get_json()
    workload = {w["title"]: w for w in api.get(f"/api/v1/calendar/conflicts?{rng(d, d + timedelta(days=1))}").get_json()["workload"]}
    assert workload["Big report"]["status"] == "at_risk"
    assert workload["Big report"]["remaining_minutes"] > workload["Big report"]["free_minutes"]
    assert workload["Small fix"]["status"] == "needs_time"
    # scheduling the small task fully removes it from the workload list
    event(api, title="Fix", kind="task_block", task_id=small["id"], starts_at=at(d, 9), ends_at=at(d, 9, 30))
    titles = [w["title"] for w in api.get(f"/api/v1/calendar/conflicts?{rng(d, d + timedelta(days=1))}").get_json()["workload"]]
    assert titles == ["Big report"] and big["id"]


def test_suggestions_prefer_preference_windows(api, hours):
    d = day(3)
    event(api, title="Study hours", kind="preference", starts_at=at(d, 10), ends_at=at(d, 11))
    task = api.post("/api/v1/tasks", {"title": "Read chapter", "status": "todo", "estimate_minutes": 60, "due_date": d.isoformat()}).get_json()
    res = api.get(f"/api/v1/calendar/suggestions?task_id={task['id']}").get_json()
    first = res["slots"][0]
    assert first["reason"] == "preferred_time" and utc_local(first["starts_at"]) == f"{d} 10:00"
    assert first["minutes"] == 60 and first["covers_remaining"]
    # after blocking 40 minutes, only 20 remain
    event(api, title="Read", kind="task_block", task_id=task["id"], starts_at=at(d, 9), ends_at=at(d, 9, 40))
    assert api.get(f"/api/v1/calendar/suggestions?task_id={task['id']}").get_json()["remaining_minutes"] == 20


def test_suggestions_never_change_anything(api, hours):
    d = day(3)
    task = api.post("/api/v1/tasks", {"title": "T", "status": "todo", "estimate_minutes": 60, "due_date": d.isoformat()}).get_json()
    before = occs(api, day(1), d + timedelta(days=1))["items"]
    api.get(f"/api/v1/calendar/suggestions?task_id={task['id']}")
    api.get(f"/api/v1/calendar/conflicts?{rng(day(1), d)}")
    assert occs(api, day(1), d + timedelta(days=1))["items"] == before


def test_needs_scheduling_filter(api):
    d = day(3)
    planned = api.post("/api/v1/tasks", {"title": "Planned", "status": "todo"}).get_json()
    api.post("/api/v1/tasks", {"title": "Unplanned", "status": "todo"})
    api.post("/api/v1/tasks", {"title": "Idea"})  # inbox items aren't ready to schedule
    event(api, kind="task_block", task_id=planned["id"], starts_at=at(d, 9), ends_at=at(d, 10))
    titles = [t["title"] for t in api.get("/api/v1/tasks?needs_scheduling=true").get_json()["items"]]
    assert titles == ["Unplanned"]
