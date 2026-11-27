"""Repeating tasks: completing one makes the next; undoing takes it back while it's untouched."""

from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from tests.test_tasks import create, kl_today

KL = ZoneInfo("Asia/Kuala_Lumpur")


def complete(api, task):
    res = api.post(f"/api/v1/tasks/{task['id']}/complete")
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def copies_of(api, task):
    items = api.get("/api/v1/tasks?view=all&limit=200").get_json()["items"]
    return [t for t in items if t["repeated_from_id"] == task["id"]]


def test_completing_makes_the_next_one(api):
    today = kl_today()
    t = create(api, title="Water plants", status="todo", priority=2, due_date=today.isoformat(), notes="balcony",
               estimate_minutes=10, tags=["home"], rrule="FREQ=DAILY")
    assert t["rrule"] == "FREQ=DAILY"
    complete(api, t)
    [nxt] = copies_of(api, t)
    assert nxt["due_date"] == (today + timedelta(days=1)).isoformat()
    assert (nxt["title"], nxt["notes"], nxt["priority"], nxt["estimate_minutes"], nxt["tags"]) == (
        "Water plants", "balcony", 2, 10, ["home"])
    assert nxt["status"] == "todo" and nxt["rrule"] == "FREQ=DAILY"
    complete(api, t)  # completing again (already done) makes nothing more
    assert len(copies_of(api, t)) == 1


def test_weekly_and_monthly_keep_their_day(api):
    monday = kl_today() + timedelta(days=7 - kl_today().weekday())  # next Monday
    weekly = create(api, status="todo", due_date=monday.isoformat(), rrule="FREQ=WEEKLY;BYDAY=MO")
    complete(api, weekly)  # done early: the next is the Monday after its due date
    assert copies_of(api, weekly)[0]["due_date"] == (monday + timedelta(days=7)).isoformat()

    first = kl_today().replace(day=1) + timedelta(days=40)
    first = first.replace(day=15)
    monthly = create(api, status="todo", due_date=first.isoformat(), rrule="FREQ=MONTHLY")
    complete(api, monthly)
    nxt = datetime.fromisoformat(copies_of(api, monthly)[0]["due_date"]).date()
    assert nxt.day == 15 and nxt > first


def test_late_task_repeats_after_today(api):
    today = kl_today()
    t = create(api, status="todo", due_date=(today - timedelta(days=3)).isoformat(), rrule="FREQ=DAILY")
    complete(api, t)
    assert copies_of(api, t)[0]["due_date"] == (today + timedelta(days=1)).isoformat()


def test_deadline_moves_with_the_due_date(api):
    today = kl_today()
    deadline = datetime.combine(today, datetime.min.time(), KL).replace(hour=17)
    t = create(api, status="todo", due_date=today.isoformat(), deadline=deadline.isoformat(), rrule="FREQ=WEEKLY")
    complete(api, t)
    nxt = copies_of(api, t)[0]
    assert datetime.fromisoformat(nxt["deadline"]) == deadline + timedelta(days=7)


def test_repeat_ends_on_its_until_date(api):
    today = kl_today()
    until = today.strftime("%Y%m%d")
    t = create(api, status="todo", due_date=today.isoformat(), rrule=f"FREQ=DAILY;UNTIL={until}")
    complete(api, t)
    assert copies_of(api, t) == []


def test_subtasks_come_back_unticked(api):
    t = create(api, status="todo", due_date=kl_today().isoformat(), rrule="FREQ=DAILY")
    sub = create(api, title="Step one", parent_task_id=t["id"])
    complete(api, sub)
    complete(api, t)
    nxt = copies_of(api, t)[0]
    subs = api.get(f"/api/v1/tasks?parent_id={nxt['id']}").get_json()["items"]
    assert [(s["title"], s["status"]) for s in subs] == [("Step one", "todo")]


def test_undo_takes_back_an_untouched_copy(api):
    t = create(api, status="todo", due_date=kl_today().isoformat(), rrule="FREQ=DAILY")
    create(api, title="Step", parent_task_id=t["id"])
    complete(api, t)
    assert len(copies_of(api, t)) == 1
    api.post(f"/api/v1/tasks/{t['id']}/reopen")
    assert copies_of(api, t) == []
    complete(api, t)  # and completing again makes a new one
    assert len(copies_of(api, t)) == 1


def test_undo_keeps_a_copy_you_already_changed(api):
    t = create(api, status="todo", due_date=kl_today().isoformat(), rrule="FREQ=DAILY")
    complete(api, t)
    nxt = copies_of(api, t)[0]
    api.patch(f"/api/v1/tasks/{nxt['id']}", {"notes": "started"})
    api.post(f"/api/v1/tasks/{t['id']}/reopen")
    assert [c["notes"] for c in copies_of(api, t)] == ["started"]
    complete(api, t)  # the existing copy stands: no second one
    assert len(copies_of(api, t)) == 1


def test_repeat_rules(api):
    assert api.post("/api/v1/tasks", {"title": "x", "rrule": "FREQ=DAILY"}).status_code == 422  # no due date
    day = kl_today().isoformat()
    assert api.post("/api/v1/tasks", {"title": "x", "due_date": day, "rrule": "FREQ=DAILY;COUNT=3"}).status_code == 422
    assert api.post("/api/v1/tasks", {"title": "x", "due_date": day, "rrule": "FREQ=HOURLY"}).status_code == 422
    parent = create(api, due_date=day)
    res = api.post("/api/v1/tasks", {"title": "x", "due_date": day, "rrule": "FREQ=DAILY", "parent_task_id": parent["id"]})
    assert res.status_code == 422 and res.get_json()["error"]["code"] == "rule_violation"
    t = create(api, due_date=day, rrule="FREQ=DAILY")
    assert api.patch(f"/api/v1/tasks/{t['id']}", {"due_date": None}).status_code == 422  # still repeating
    stopped = api.patch(f"/api/v1/tasks/{t['id']}", {"rrule": None}).get_json()
    assert stopped["rrule"] is None
    complete(api, stopped)
    assert copies_of(api, t) == []



def test_repeating_tasks_survive_backup_and_restore(app, api):
    from tests.test_backup import apply, export, new_account, ok, preview, wipe_database

    t = create(api, status="todo", due_date=kl_today().isoformat(), rrule="FREQ=DAILY")
    complete(api, t)
    before = export(api)
    # the copy first, before the task it points back to: the link is only checked at commit
    before["data"]["tasks"].sort(key=lambda r: r["repeated_from_id"] is None)
    assert before["data"]["tasks"][0]["repeated_from_id"] == t["id"]

    wipe_database()
    fresh = new_account(app)
    ok(apply(fresh, before, ok(preview(fresh, before))["preview_token"]))
    [copy] = copies_of(fresh, t)
    assert copy["rrule"] == "FREQ=DAILY"
