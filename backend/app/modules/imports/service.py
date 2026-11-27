"""Import from other apps: a calendar file (.ics), a Todoist CSV export, or Google Tasks' Tasks.json (Google Takeout).

The format is recognised from the file itself. `read` turns it into a plan: what would be added, what's already here
(duplicates are skipped, so importing the same file twice adds nothing) and what can't be brought in, and why.
`apply` adds the plan through the same rules as creating each item by hand. Nothing is written by `read`.
"""

import csv
import io
import json
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone

from dateutil import parser as dateparser
from icalendar import Calendar
from pydantic import ValidationError
from sqlalchemy import select

from app.common.errors import ApiError
from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.calendar.models import ScheduleEvent
from app.modules.calendar.schemas import EventCreate
from app.modules.calendar.service import create_event
from app.modules.tasks.models import Task
from app.modules.tasks.schemas import TaskCreate
from app.modules.tasks.service import create_task

MAX_ITEMS = 2000
SHOWN = 50  # items and skips listed in the preview
WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
DAY_NAMES = {
    name: i
    for i, names in enumerate([
        ("monday", "mon"), ("tuesday", "tue", "tues"), ("wednesday", "wed"), ("thursday", "thu", "thurs"),
        ("friday", "fri"), ("saturday", "sat"), ("sunday", "sun"),
    ])
    for name in names
}


@dataclass
class Item:
    kind: str  # "event" | "task"
    title: str
    when: str | None  # ISO date (or date-time) shown in the preview
    data: EventCreate | TaskCreate
    key: tuple  # for the duplicate check
    note: str | None = None  # something that came across differently (e.g. a repeat it couldn't keep)
    subtasks: list[TaskCreate] = field(default_factory=list)


@dataclass
class Plan:
    format: str
    items: list[Item] = field(default_factory=list)
    duplicates: int = 0
    skipped: list[dict] = field(default_factory=list)


def _problem(message: str) -> ApiError:
    return ApiError(422, "import_unreadable", message)


def _clip(text, n: int) -> str | None:
    text = (str(text) if text is not None else "").strip()
    return text[:n] if text else None


def _valid(model, values: dict, title: str, plan: Plan, quiet: bool = False):
    """The item as the API would accept it, or None (and a note in `skipped` unless `quiet`)."""
    try:
        return model.model_validate(values)
    except ValidationError as e:
        if not quiet:
            message = " ".join(str(err.get("msg", "")) for err in e.errors())
            reason = "too_long" if ("7 days" in message or "31 days" in message) else "invalid"
            plan.skipped.append({"title": title, "reason": reason})
        return None


# ---------- calendar files ----------

def _ics(user, content: str, plan: Plan) -> None:
    try:
        cal = Calendar.from_ical(content)
    except Exception:  # noqa: BLE001 — icalendar raises many kinds of error for a damaged file
        raise _problem("This calendar file couldn't be read.") from None
    zone = user_zone(user)
    for ev in cal.walk("VEVENT"):
        title = _clip(ev.get("SUMMARY"), 200) or "(No title)"
        if str(ev.get("STATUS", "")).upper() == "CANCELLED":
            plan.skipped.append({"title": title, "reason": "cancelled"})
            continue
        if ev.get("RECURRENCE-ID") is not None:  # one changed occurrence of a repeating event
            plan.skipped.append({"title": title, "reason": "changed_occurrence"})
            continue
        if ev.get("DTSTART") is None:
            plan.skipped.append({"title": title, "reason": "no_start"})
            continue
        start = ev.decoded("DTSTART")
        end = ev.decoded("DTEND") if ev.get("DTEND") is not None else None
        if end is None and ev.get("DURATION") is not None:
            end = start + ev.decoded("DURATION")
        rrule = ev.get("RRULE").to_ical().decode() if ev.get("RRULE") is not None else None
        note = "skipped_dates_dropped" if rrule and ev.get("EXDATE") is not None else None
        values = {"title": title, "description": _clip(ev.get("DESCRIPTION"), 5000), "rrule": rrule}
        if isinstance(start, datetime):
            if start.tzinfo is None:  # a "floating" time: the same clock time wherever you are
                start = start.replace(tzinfo=zone)
            if not isinstance(end, datetime):
                end = start + timedelta(hours=1)
            elif end.tzinfo is None:
                end = end.replace(tzinfo=zone)
            values |= {"starts_at": start, "ends_at": end}
            when = start.astimezone(zone).isoformat(timespec="minutes")
            key = (title.lower(), start.astimezone(timezone.utc))
        else:  # all-day: DTEND is the day after the last day
            last = end - timedelta(days=1) if isinstance(end, date) and end > start else start
            values |= {"all_day": True, "start_date": start, "end_date": last}
            when, key = start.isoformat(), (title.lower(), start)
        data = _valid(EventCreate, values, title, plan, quiet=bool(rrule))
        if data is None and rrule:  # a repeat this app can't express: keep the first occurrence
            data = _valid(EventCreate, {**values, "rrule": None}, title, plan)
            note = "repeat_dropped"
        if data is not None:
            plan.items.append(Item("event", title, when, data, key, note))


def _event_keys(user) -> set:
    zone = user_zone(user)
    rows = db.session.execute(
        select(ScheduleEvent.title, ScheduleEvent.starts_at, ScheduleEvent.all_day)
        .where(ScheduleEvent.user_id == user.id, ScheduleEvent.archived_at.is_(None))
    ).all()
    return {(t.lower(), s.astimezone(zone).date() if all_day else s.astimezone(timezone.utc)) for t, s, all_day in rows}


# ---------- Todoist (CSV export) ----------

def _next_weekday(today: date, weekday: int) -> date:
    return today + timedelta(days=(weekday - today.weekday()) % 7)


def todoist_date(text: str, today: date) -> tuple[date | None, str | None, bool]:
    """Todoist exports the date as you typed it ("every monday", "Nov 28"). Returns (due, repeat rule, understood)."""
    t = " ".join(text.lower().split())
    if not t:
        return None, None, True
    if t in ("today", "tod"):
        return today, None, True
    if t in ("tomorrow", "tom"):
        return today + timedelta(days=1), None, True
    if t.startswith("every ") or t in ("daily", "weekly", "monthly", "yearly"):
        rest = t.removeprefix("every ").strip()
        if rest in ("day", "daily", "days"):
            return today, "FREQ=DAILY", True
        if rest in ("weekday", "workday", "weekdays", "workdays"):
            day = today if today.weekday() < 5 else _next_weekday(today, 0)
            return day, "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR", True
        if rest in ("week", "weekly"):
            return today, f"FREQ=WEEKLY;BYDAY={WEEKDAYS[today.weekday()]}", True
        if rest in ("month", "monthly"):
            return today, "FREQ=MONTHLY", True
        if rest in ("year", "yearly"):
            return today, "FREQ=YEARLY", True
        if rest in DAY_NAMES:
            day = _next_weekday(today, DAY_NAMES[rest])
            return day, f"FREQ=WEEKLY;BYDAY={WEEKDAYS[day.weekday()]}", True
        return None, None, False
    try:
        return dateparser.parse(text, default=datetime.combine(today, time.min)).date(), None, True
    except (ValueError, OverflowError):
        return None, None, False


def _todoist(user, content: str, plan: Plan) -> None:
    today = user_today(user)
    reader = csv.DictReader(io.StringIO(content.lstrip("﻿")))
    if not reader.fieldnames or "CONTENT" not in reader.fieldnames:
        raise _problem("This CSV file isn't a Todoist export (it has no CONTENT column).")
    parent: Item | None = None
    for row in reader:
        if (row.get("TYPE") or "").strip().lower() != "task":
            continue
        raw = (row.get("CONTENT") or "").strip()
        words = raw.split()
        labels = [w for w in words if w.startswith("@") and len(w) > 1]
        title = _clip(" ".join(w for w in words if w not in labels) or raw, 200) or "(No title)"
        due, rrule, understood = todoist_date(row.get("DATE") or "", today)
        try:
            todoist_priority = int(row.get("PRIORITY") or 1)  # Todoist: 4 is the most urgent (p1)
        except ValueError:
            todoist_priority = 1
        values = {
            "title": title, "notes": _clip(row.get("DESCRIPTION"), 20_000), "status": "todo",
            "priority": {4: 1, 3: 2}.get(todoist_priority, 3), "due_date": due, "rrule": rrule,
            "tags": [w[1:41] for w in labels][:10],
        }
        try:
            indent = int(row.get("INDENT") or 1)
        except ValueError:
            indent = 1
        if indent > 1 and parent is not None:  # a subtask (one level deep, as in Life OS)
            sub = _valid(TaskCreate, {**values, "rrule": None, "due_date": None}, title, plan)
            if sub is not None:
                parent.subtasks.append(sub)
            continue
        data = _valid(TaskCreate, values, title, plan)
        parent = None
        if data is not None:
            parent = Item("task", title, due.isoformat() if due else None, data, (title.lower(), due),
                          None if understood else "date_not_understood")
            plan.items.append(parent)


# ---------- Google Tasks (Tasks.json from Google Takeout) ----------

def _google_tasks(content: str, plan: Plan) -> None:
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        raise _problem("This file isn't valid JSON.") from None
    lists = data.get("items") if isinstance(data, dict) else None
    if not isinstance(lists, list):
        raise _problem("This JSON file isn't a Google Tasks export (Tasks.json from Google Takeout).")
    several = len(lists) > 1  # with several lists, each task is tagged with its list's name
    for task_list in lists:
        list_tag = _clip(task_list.get("title"), 40) if several else None
        by_id: dict[str, Item] = {}
        children: list[tuple[str, dict, str]] = []
        for t in task_list.get("items") or []:
            title = _clip(t.get("title"), 200) or "(No title)"
            if t.get("deleted"):
                continue
            if t.get("status") == "completed":
                plan.skipped.append({"title": title, "reason": "already_done"})
                continue
            due = None
            if t.get("due"):
                try:
                    due = date.fromisoformat(str(t["due"])[:10])  # Google keeps the day at midnight UTC
                except ValueError:
                    pass
            values = {"title": title, "notes": _clip(t.get("notes"), 20_000), "status": "todo", "due_date": due,
                      "tags": [list_tag] if list_tag else []}
            if t.get("parent"):
                children.append((str(t["parent"]), values, title))
                continue
            item_data = _valid(TaskCreate, values, title, plan)
            if item_data is not None:
                item = Item("task", title, due.isoformat() if due else None, item_data, (title.lower(), due))
                plan.items.append(item)
                by_id[str(t.get("id"))] = item
        for parent_id, values, title in children:
            parent = by_id.get(parent_id)
            if parent is not None:
                sub = _valid(TaskCreate, {**values, "due_date": None, "tags": []}, title, plan)
                if sub is not None:
                    parent.subtasks.append(sub)
                continue
            alone = _valid(TaskCreate, values, title, plan)  # its parent is done or gone: bring it in on its own
            if alone is not None:
                due = values["due_date"]
                plan.items.append(Item("task", title, due.isoformat() if due else None, alone, (title.lower(), due)))


def _task_keys(user) -> set:
    rows = db.session.execute(
        select(Task.title, Task.due_date)
        .where(Task.user_id == user.id, Task.archived_at.is_(None), Task.parent_task_id.is_(None))
    ).all()
    return {(t.lower(), d) for t, d in rows}


# ---------- reading and applying ----------

def detect(content: str) -> str:
    head = content.lstrip("﻿ \r\n\t")[:2000]
    if head.upper().startswith("BEGIN:VCALENDAR"):
        return "ics"
    if head.startswith("{"):
        return "google_tasks"
    first_line = head.splitlines()[0] if head else ""
    if "CONTENT" in first_line and "TYPE" in first_line:
        return "todoist"
    raise _problem("Life OS can't import this file. Use a calendar file (.ics), a Todoist CSV export "
                   "or Google Tasks' Tasks.json.")


def read(user, content: str) -> Plan:
    plan = Plan(detect(content))
    if plan.format == "ics":
        _ics(user, content, plan)
        existing = _event_keys(user)
    elif plan.format == "todoist":
        _todoist(user, content, plan)
        existing = _task_keys(user)
    else:
        _google_tasks(content, plan)
        existing = _task_keys(user)
    if len(plan.items) > MAX_ITEMS:
        raise _problem(f"This file has more than {MAX_ITEMS} items. Split it into smaller files.")
    fresh, seen = [], set()
    for item in plan.items:
        if item.key in existing or item.key in seen:  # already here (or twice in the file)
            plan.duplicates += 1
        else:
            seen.add(item.key)
            fresh.append(item)
    plan.items = fresh
    return plan


def preview(plan: Plan) -> dict:
    return {
        "format": plan.format,
        "kind": "events" if plan.format == "ics" else "tasks",
        "new": len(plan.items),
        "subtasks": sum(len(i.subtasks) for i in plan.items),
        "duplicates": plan.duplicates,
        "skipped": len(plan.skipped),
        "items": [{"title": i.title, "when": i.when, "note": i.note, "repeats": bool(i.data.rrule),
                   "subtasks": len(i.subtasks)} for i in plan.items[:SHOWN]],
        "skipped_items": plan.skipped[:SHOWN],
    }


def apply(user, plan: Plan) -> dict:
    for item in plan.items:
        if item.kind == "event":
            create_event(user, item.data)
        else:
            task = create_task(user, item.data)
            for sub in item.subtasks:
                create_task(user, sub.model_copy(update={"parent_task_id": task.id}))
    return {"added": len(plan.items), "subtasks": sum(len(i.subtasks) for i in plan.items),
            "duplicates": plan.duplicates, "skipped": len(plan.skipped)}
