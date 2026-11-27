"""Import from other apps: calendar files, Todoist CSV and Google Tasks JSON. Preview is a dry run; importing the same
file twice adds nothing the second time."""

import json
from datetime import date, timedelta

from app.modules.imports.service import todoist_date
from tests.test_tasks import kl_today

ICS = """BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//EN
BEGIN:VEVENT
UID:1
SUMMARY:Dentist
DESCRIPTION:Bring the form
DTSTART:20270115T020000Z
DTEND:20270115T030000Z
END:VEVENT
BEGIN:VEVENT
UID:2
SUMMARY:Team standup
DTSTART;TZID=Asia/Kuala_Lumpur:20270111T090000
DTEND;TZID=Asia/Kuala_Lumpur:20270111T091500
RRULE:FREQ=WEEKLY;BYDAY=MO,WE
END:VEVENT
BEGIN:VEVENT
UID:3
SUMMARY:Holiday
DTSTART;VALUE=DATE:20270120
DTEND;VALUE=DATE:20270123
END:VEVENT
BEGIN:VEVENT
UID:4
SUMMARY:Every hour ping
DTSTART:20270115T050000Z
DTEND:20270115T051000Z
RRULE:FREQ=HOURLY
END:VEVENT
BEGIN:VEVENT
UID:5
SUMMARY:Called off
STATUS:CANCELLED
DTSTART:20270116T020000Z
DTEND:20270116T030000Z
END:VEVENT
BEGIN:VEVENT
UID:2
RECURRENCE-ID;TZID=Asia/Kuala_Lumpur:20270113T090000
SUMMARY:Team standup (moved)
DTSTART;TZID=Asia/Kuala_Lumpur:20270113T100000
DTEND;TZID=Asia/Kuala_Lumpur:20270113T101500
END:VEVENT
END:VCALENDAR
"""

TODOIST = """TYPE,CONTENT,DESCRIPTION,PRIORITY,INDENT,AUTHOR,RESPONSIBLE,DATE,DATE_LANG,TIMEZONE
section,Errands,,,,,,,,
task,Buy stamps @errands,For the letters,4,1,Me,,2027-01-15,en,Asia/Kuala_Lumpur
task,Get envelopes,,1,2,Me,,,en,
task,Water plants @home,,1,1,Me,,every day,en,
task,Something odd,,2,1,Me,,every other full moon,en,
"""

GOOGLE = {
    "kind": "tasks#taskLists",
    "items": [
        {"kind": "tasks#taskList", "title": "Work", "items": [
            {"kind": "tasks#task", "id": "a", "title": "Write report", "notes": "Q4", "status": "needsAction",
             "due": "2027-01-18T00:00:00.000Z"},
            {"kind": "tasks#task", "id": "b", "title": "Outline", "status": "needsAction", "parent": "a"},
            {"kind": "tasks#task", "id": "c", "title": "Old thing", "status": "completed"},
        ]},
        {"kind": "tasks#taskList", "title": "Home", "items": [
            {"kind": "tasks#task", "id": "d", "title": "Fix the tap", "status": "needsAction"},
        ]},
    ],
}


def preview(api, content):
    return api.post("/api/v1/import/preview", {"content": content})


def apply(api, content):
    res = api.post("/api/v1/import/apply", {"content": content})
    assert res.status_code == 200, res.get_json()
    return res.get_json()


def occurrences(api, start, end):
    res = api.get(f"/api/v1/calendar/occurrences?start={start}T00:00:00%2B08:00&end={end}T00:00:00%2B08:00")
    return res.get_json()["items"]


def test_calendar_file(api):
    p = preview(api, ICS).get_json()
    assert p["format"] == "ics" and p["kind"] == "events"
    assert [i["title"] for i in p["items"]] == ["Dentist", "Team standup", "Holiday", "Every hour ping"]
    assert [i["repeats"] for i in p["items"]] == [False, True, False, False]
    assert p["items"][3]["note"] == "repeat_dropped"  # hourly can't repeat here: the first one comes in
    assert {s["reason"] for s in p["skipped_items"]} == {"cancelled", "changed_occurrence"}
    assert api.get("/api/v1/calendar/occurrences?start=2027-01-01T00:00:00%2B08:00&end=2027-02-01T00:00:00%2B08:00").get_json()["items"] == []  # preview wrote nothing

    assert apply(api, ICS)["added"] == 4
    week = occurrences(api, "2027-01-11", "2027-01-25")
    titles = [o["title"] for o in week]
    assert titles.count("Team standup") == 4  # Mon + Wed, two weeks
    dentist = next(o for o in week if o["title"] == "Dentist")
    assert dentist["starts_at"].startswith("2027-01-15T02:00:00")
    holiday = next(o for o in week if o["title"] == "Holiday")
    assert holiday["all_day"] is True

    again = preview(api, ICS).get_json()  # importing twice adds nothing
    assert again["new"] == 0 and again["duplicates"] == 4


def test_todoist_csv(api):
    p = preview(api, TODOIST).get_json()
    assert p["format"] == "todoist" and p["new"] == 3 and p["subtasks"] == 1
    assert p["items"][2]["note"] == "date_not_understood"
    apply(api, TODOIST)
    tasks = {t["title"]: t for t in api.get("/api/v1/tasks?view=all&limit=50").get_json()["items"]}
    stamps = tasks["Buy stamps"]
    assert (stamps["priority"], stamps["due_date"], stamps["tags"], stamps["notes"]) == (1, "2027-01-15", ["errands"], "For the letters")
    assert stamps["subtasks_total"] == 1
    water = tasks["Water plants"]
    assert water["rrule"] == "FREQ=DAILY" and water["due_date"] == kl_today().isoformat() and water["tags"] == ["home"]
    assert tasks["Something odd"]["due_date"] is None and tasks["Something odd"]["priority"] == 3
    assert preview(api, TODOIST).get_json()["new"] == 0


def test_google_tasks_json(api):
    content = json.dumps(GOOGLE)
    p = preview(api, content).get_json()
    assert p["format"] == "google_tasks" and p["new"] == 2 and p["subtasks"] == 1
    assert p["skipped_items"] == [{"title": "Old thing", "reason": "already_done"}]
    apply(api, content)
    tasks = {t["title"]: t for t in api.get("/api/v1/tasks?view=all&limit=50").get_json()["items"]}
    report = tasks["Write report"]
    assert (report["due_date"], report["notes"], report["tags"], report["subtasks_total"]) == ("2027-01-18", "Q4", ["Work"], 1)
    assert tasks["Fix the tap"]["tags"] == ["Home"]


def test_unreadable_files(api):
    for content in ("hello world", "BEGIN:VCALENDAR\nthis is broken", "{not json", '{"kind": "something"}',
                    "name,email\nA,b"):
        res = preview(api, content)
        assert res.status_code == 422 and res.get_json()["error"]["code"] == "import_unreadable", content
    assert api.post("/api/v1/import/preview", {}).status_code == 400
    assert api.post("/api/v1/import/preview", {"content": "   "}).status_code == 400


def test_needs_sign_in(anon):
    assert anon.post("/api/v1/import/preview", {"content": ICS}).status_code in (401, 403)


def test_todoist_dates():
    today = date(2026, 11, 27)  # a Friday
    assert todoist_date("", today) == (None, None, True)
    assert todoist_date("tomorrow", today) == (today + timedelta(days=1), None, True)
    assert todoist_date("2027-01-15", today) == (date(2027, 1, 15), None, True)
    assert todoist_date("Dec 3", today)[0] == date(2026, 12, 3)
    assert todoist_date("every monday", today) == (date(2026, 11, 30), "FREQ=WEEKLY;BYDAY=MO", True)
    assert todoist_date("every weekday", today) == (today, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", True)
    assert todoist_date("every month", today) == (today, "FREQ=MONTHLY", True)
    assert todoist_date("every 3rd tuesday", today) == (None, None, False)
