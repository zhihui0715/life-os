"""Reminders that reach a device even when Life OS is closed (Web Push).

The free server sleeps when nobody visits, so it can't keep its own clock. Instead an outside scheduler (e.g.
cron-job.org) calls POST /api/v1/push/tick every TICK_MINUTES; each call works out what's due for every subscribed
device and sends it once. The reminders are the same as the in-app ones (lib/reminders.ts), with the same tags, so a
device with the app open too shows each reminder once. Because a tick may be up to TICK_MINUTES apart, reminders
before a time (events, deadlines) look one tick ahead: they arrive on time or a little early, never late.
"""

import json
import logging
from dataclasses import dataclass
from datetime import datetime, time, timedelta

from flask import current_app
from pywebpush import WebPushException, webpush
from requests import RequestException
from sqlalchemy import delete, select

from app.common.models import utcnow
from app.common.timeutil import user_zone
from app.extensions import db
from app.modules.auth.models import User
from app.modules.calendar.service import occurrences
from app.modules.habits.service import HabitQuery, list_habits
from app.modules.push.models import PushSent, PushSubscription
from app.modules.tasks.models import Task

log = logging.getLogger(__name__)

TICK_MINUTES = 15  # how often the scheduler calls /tick
DEADLINE_LEAD_MIN = 30
LATE_WINDOW_MIN = 3 * 60  # a morning reminder sent at 3 pm is no longer useful
KEEP_SENT_DAYS = 3
TTL_SECONDS = 30 * 60  # a push service drops a reminder the device couldn't get within half an hour

TEXT = {
    "en": {
        "eventSoon": "Starts at {time}", "deadline": "Deadline at {time}",
        "habitsTitle": ("{count} habit left today", "{count} habits left today"),
        "planTitle": "Plan your day", "planBody": "Pick your top three and fit them into today.",
        "reviewTitle": "Time for your weekly review", "reviewBody": "Five minutes to look back and set next week's top 3.",
        "testTitle": "Reminders are on", "testBody": "This one came from the server, so they'll reach you even with Life OS closed.",
    },
    "zh-CN": {
        "eventSoon": "{time} 开始", "deadline": "截止时间 {time}",
        "habitsTitle": ("今天还有 {count} 个习惯", "今天还有 {count} 个习惯"),
        "planTitle": "计划今天", "planBody": "选出三件要事，排进今天。",
        "reviewTitle": "该做每周回顾了", "reviewBody": "花五分钟回顾本周，定下下周三件要事。",
        "testTitle": "提醒已开启", "testBody": "这条来自服务器，即使关闭 Life OS 也能收到提醒。",
    },
}


@dataclass(frozen=True)
class Reminder:
    key: str  # sent once per device per key
    title: str
    body: str
    url: str
    tag: str  # the same tag as the in-app reminder, so the two replace each other instead of showing twice


def _text(user) -> dict:
    return TEXT.get(user.settings.locale, TEXT["en"])


def _clock(dt: datetime, user) -> str:
    local = dt.astimezone(user_zone(user))
    if user.settings.locale == "zh-CN":
        return local.strftime("%H:%M")
    return f"{local.hour % 12 or 12}:{local.minute:02d} {'AM' if local.hour < 12 else 'PM'}"


def _minutes(hhmm: str) -> int | None:
    try:
        h, m = (int(x) for x in hhmm.split(":"))
    except (ValueError, AttributeError):
        return None
    return h * 60 + m if 0 <= h < 24 and 0 <= m < 60 else None


def _daily_due(local_now: datetime, at: str) -> bool:
    target = _minutes(at)
    now_min = local_now.hour * 60 + local_now.minute
    return target is not None and 0 <= now_min - target <= LATE_WINDOW_MIN


def due_reminders(user, prefs: dict, now: datetime) -> list[Reminder]:
    """Everything due for one device now. Callers drop the ones already sent (by key)."""
    text = _text(user)
    out: list[Reminder] = []
    lead = int(prefs.get("eventLead") or 0)
    ahead = timedelta(minutes=TICK_MINUTES)

    if lead:
        for o in occurrences(user, now, now + timedelta(minutes=lead) + ahead):
            if o.event.all_day or o.event.kind == "preference" or o.starts_at <= now:
                continue
            out.append(Reminder(f"ev:{o.event.id}:{o.starts_at.isoformat()}", o.title,
                                text["eventSoon"].format(time=_clock(o.starts_at, user)), "/calendar", f"ev:{o.event.id}"))

    if prefs.get("deadlines", True):
        tasks = db.session.scalars(
            select(Task).where(Task.user_id == user.id, Task.status != "done", Task.archived_at.is_(None),
                               Task.deadline > now, Task.deadline <= now + timedelta(minutes=DEADLINE_LEAD_MIN) + ahead)
        ).all()
        for t in tasks:
            out.append(Reminder(f"dl:{t.id}:{t.deadline.isoformat()}", t.title,
                                text["deadline"].format(time=_clock(t.deadline, user)), "/tasks?view=today", f"dl:{t.id}"))

    local = now.astimezone(user_zone(user))
    day = local.date().isoformat()
    if _daily_due(local, prefs.get("planAt", "")):
        out.append(Reminder(f"pl:{day}", text["planTitle"], text["planBody"], "/plan", "plan"))
    week_start = user.settings.week_start  # 1 Monday … 7 Sunday
    last_day = 7 if week_start == 1 else week_start - 1
    if local.isoweekday() == last_day and _daily_due(local, prefs.get("reviewAt", "")):
        out.append(Reminder(f"rv:{day}", text["reviewTitle"], text["reviewBody"], "/plan?tab=week", "review"))
    if _daily_due(local, prefs.get("habitsAt", "")):
        left = [h["name"] for h in list_habits(user, HabitQuery()) if h["scheduled_today"] and not h["today"]]
        if left:
            one, many = text["habitsTitle"]
            title = (one if len(left) == 1 else many).format(count=len(left))
            out.append(Reminder(f"hb:{day}", title, " · ".join(left), "/habits", "habits"))
        else:  # nothing left: mark the day as handled so it isn't re-checked all evening
            out.append(Reminder(f"hb:{day}", "", "", "", ""))
    return out


# ---------- sending ----------

def configured() -> bool:
    return bool(current_app.config.get("VAPID_PUBLIC_KEY") and current_app.config.get("VAPID_PRIVATE_KEY"))


def _subject() -> str:
    from flask import request

    return current_app.config.get("VAPID_SUBJECT") or request.host_url.rstrip("/")


SENT, GONE, RETRY = "sent", "gone", "retry"


def send(sub: PushSubscription, reminder: Reminder) -> str:
    """Sends one reminder: SENT; GONE when the device has unsubscribed (the subscription is then removed); or RETRY
    when it didn't go through this time (the next tick tries again while it's still due)."""
    try:
        webpush(
            subscription_info={"endpoint": sub.endpoint, "keys": {"p256dh": sub.p256dh, "auth": sub.auth}},
            data=json.dumps({"title": reminder.title, "body": reminder.body, "url": reminder.url, "tag": reminder.tag}),
            vapid_private_key=current_app.config["VAPID_PRIVATE_KEY"],
            vapid_claims={"sub": _subject()},
            ttl=TTL_SECONDS,
            timeout=10,
        )
    except WebPushException as e:
        status = getattr(e.response, "status_code", None)
        if status in (404, 410):  # the browser dropped this subscription (app removed, permission revoked…)
            db.session.delete(sub)
            return GONE
        log.warning("push failed status=%s subscription=%s", status, sub.id)
        return RETRY
    except RequestException as e:  # the push service couldn't be reached
        log.warning("push service unreachable subscription=%s: %s", sub.id, type(e).__name__)
        return RETRY
    sub.last_sent_at = utcnow()
    return SENT


def tick(now: datetime | None = None) -> dict:
    """One scheduler call: send what's due to every device, each reminder once."""
    now = now or utcnow()
    db.session.execute(delete(PushSent).where(PushSent.sent_at < now - timedelta(days=KEEP_SENT_DAYS)))
    subs = db.session.scalars(select(PushSubscription).order_by(PushSubscription.user_id)).all()
    users = {u.id: u for u in db.session.scalars(select(User).where(User.id.in_({s.user_id for s in subs})))}
    sent = devices = 0
    for sub in subs:
        user = users.get(sub.user_id)
        if user is None:
            continue
        done = set(db.session.scalars(select(PushSent.key).where(PushSent.subscription_id == sub.id)))
        reminders = [r for r in due_reminders(user, sub.prefs, now) if r.key not in done]
        outcome = SENT
        for r in reminders:
            if r.title:  # (a habit check with nothing left is only recorded, not sent)
                outcome = send(sub, r)
                if outcome == GONE:
                    break
                if outcome == RETRY:
                    continue
                sent += 1
            db.session.add(PushSent(subscription_id=sub.id, key=r.key, sent_at=now))
        devices += outcome != GONE
        db.session.commit()
    return {"devices": devices, "sent": sent}


def send_test(user, sub: PushSubscription) -> str:
    text = _text(user)
    outcome = send(sub, Reminder("test", text["testTitle"], text["testBody"], "/settings", "test"))
    db.session.commit()
    return outcome
