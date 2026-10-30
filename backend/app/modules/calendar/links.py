"""Calendar links with Google Calendar, both ways, with no Google sign-in:

- Out: a private feed URL (iCalendar) of your events and task due dates. You add it in Google Calendar under
  "Other calendars → From URL"; Google refreshes it on its own schedule (every few hours).
- In: you paste Google Calendar's "Secret address in iCal format"; Life OS shows those events (read-only) on the
  calendar and treats them as busy time in Plan my day. Fetched at most every CACHE_SECONDS.

Both URLs are secrets: anyone with one can read that calendar. They're never logged and never put in backups.
"""

import logging
import secrets
import time as clock
import urllib.error
import urllib.request
from datetime import datetime, timedelta
from urllib.parse import urlsplit

import recurring_ical_events
from icalendar import Calendar, Event

from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.calendar.service import occurrences
from app.modules.tasks.models import Task

log = logging.getLogger(__name__)

FEED_PAST_DAYS = 30
FEED_FUTURE_DAYS = 365
CACHE_SECONDS = 15 * 60
ERROR_CACHE_SECONDS = 2 * 60
MAX_BYTES = 5 * 1024 * 1024
TIMEOUT_SECONDS = 10
GOOGLE_HOST = "calendar.google.com"

# user id → (url, fetched at (monotonic), parsed calendar or None when the read failed, why it failed or None)
_cache: dict = {}


# ---------- out: the feed ----------

def new_feed_token(user) -> str:
    user.settings.calendar_feed_token = secrets.token_urlsafe(32)
    db.session.commit()
    return user.settings.calendar_feed_token


def stop_feed(user) -> None:
    user.settings.calendar_feed_token = None
    db.session.commit()


def feed_ics(user) -> bytes:
    zone = user_zone(user)
    today = user_today(user)
    start = datetime.combine(today - timedelta(days=FEED_PAST_DAYS), datetime.min.time(), zone)
    end = datetime.combine(today + timedelta(days=FEED_FUTURE_DAYS), datetime.min.time(), zone)
    now = utcnow()

    cal = Calendar()
    cal.add("prodid", "-//Life OS//Calendar feed//EN")
    cal.add("version", "2.0")
    cal.add("x-wr-calname", "Life OS")
    cal.add("x-wr-timezone", user.settings.timezone)
    for o in occurrences(user, start, end):
        if o.event.kind == "preference":
            continue  # soft "I'd rather…" windows aren't appointments
        ev = Event()
        ev.add("uid", f"{o.id}@life-os")
        ev.add("dtstamp", now)
        ev.add("summary", o.title)
        if o.event.all_day:
            ev.add("dtstart", o.starts_at.astimezone(zone).date())
            ev.add("dtend", o.ends_at.astimezone(zone).date())
        else:
            ev.add("dtstart", o.starts_at)
            ev.add("dtend", o.ends_at)
        cal.add_component(ev)

    tasks = db.session.scalars(
        db.select(Task).where(Task.user_id == user.id, Task.status != "done", Task.archived_at.is_(None),
                              Task.due_date >= start.date(), Task.due_date <= end.date())
    )
    for t in tasks:
        ev = Event()
        ev.add("uid", f"task-{t.id}@life-os")
        ev.add("dtstamp", now)
        ev.add("summary", f"☐ {t.title}")
        ev.add("dtstart", t.due_date)
        ev.add("dtend", t.due_date + timedelta(days=1))
        ev.add("transp", "TRANSPARENT")  # a due date doesn't make you busy
        cal.add_component(ev)
    return cal.to_ical()


# ---------- in: a Google calendar ----------

def check_google_url(url: str) -> str:
    """Only Google Calendar's own iCal addresses, over https: the server fetches this URL, so it must never be
    able to reach anything else."""
    url = url.strip()
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.hostname != GOOGLE_HOST or parts.port not in (None, 443)
            or parts.username or not parts.path.startswith("/calendar/ical/") or not parts.path.endswith(".ics")):
        raise ApiError(422, "validation_error", "That isn't a Google Calendar iCal address.",
                       fields={"url": [{"type": "invalid_google_ics", "message": "not a Google Calendar iCal address"}]})
    return url


class _TooLarge(Exception):
    pass


class _NoRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None  # a redirect could point anywhere; treat it as a failure


def _download(url: str) -> bytes:
    opener = urllib.request.build_opener(_NoRedirects)
    with opener.open(urllib.request.Request(url, headers={"User-Agent": "LifeOS"}), timeout=TIMEOUT_SECONDS) as res:
        body = res.read(MAX_BYTES + 1)
    if len(body) > MAX_BYTES:
        raise _TooLarge()
    return body


def set_google_url(user, url: str | None) -> None:
    user.settings.google_ics_url = check_google_url(url) if url else None
    _cache.pop(user.id, None)
    db.session.commit()


# Why a linked Google calendar couldn't be read, in words the app can explain (Settings shows each one):
# public_not_shared  a "public address" of a calendar that isn't public (copy the secret address instead)
# not_found          Google doesn't know the address: mistyped, or the secret address was reset in Google
# denied             Google refused it
# google_busy        Google answered with an error or "too many requests"; it will try again
# timeout            Google took too long to answer
# unreachable        Google couldn't be reached at all, or it sent the request elsewhere (not followed)
# too_large          bigger than MAX_BYTES
# not_calendar       Google answered, but not with a calendar file
def _problem(e: Exception, url: str) -> str:
    if isinstance(e, urllib.error.HTTPError):
        if e.code == 404:
            return "public_not_shared" if "/public/" in urlsplit(url).path else "not_found"
        if e.code in (401, 403):
            return "denied"
        if e.code == 429 or e.code >= 500:
            return "google_busy"
        return "unreachable"  # including a redirect, which is never followed
    if isinstance(e, TimeoutError) or (isinstance(e, urllib.error.URLError) and isinstance(e.reason, TimeoutError)):
        return "timeout"
    if isinstance(e, _TooLarge):
        return "too_large"
    return "unreachable"


def _read(url: str) -> tuple[Calendar | None, str | None]:
    try:
        body = _download(url)
    except Exception as e:  # noqa: BLE001 — any network problem just means "no Google events right now"
        return None, _problem(e, url)
    try:
        return Calendar.from_ical(body), None
    except Exception:  # noqa: BLE001
        return None, "not_calendar"


def _google_calendar(user):
    """(parsed Google calendar or None, why it couldn't be read or None), from the cache when fresh."""
    url = user.settings.google_ics_url
    if not url:
        return None, None
    hit = _cache.get(user.id)
    now = clock.monotonic()
    if hit and hit[0] == url and now - hit[1] < (CACHE_SECONDS if hit[2] is not None else ERROR_CACHE_SECONDS):
        return hit[2], hit[3]
    cal, problem = _read(url)
    if problem:
        log.warning("google calendar read failed for user %s: %s", user.id, problem)  # never the URL
    _cache[user.id] = (url, now, cal, problem)
    return cal, problem


def google_status(user) -> tuple[str, str | None]:
    """(off | ok | error, and for error: why — see _problem)."""
    if not user.settings.google_ics_url:
        return "off", None
    cal, problem = _google_calendar(user)
    return ("ok", None) if cal is not None else ("error", problem)


def _as_datetime(v, zone) -> tuple[datetime, bool]:
    if isinstance(v, datetime):
        return (v if v.tzinfo else v.replace(tzinfo=zone)), False
    return datetime.combine(v, datetime.min.time(), zone), True  # a date: all-day


def google_events(user, start: datetime, end: datetime) -> list[dict]:
    cal = _google_calendar(user)[0]
    if cal is None:
        return []
    zone = user_zone(user)
    out = []
    for ev in recurring_ical_events.of(cal).between(start, end):
        if str(ev.get("status", "")).upper() == "CANCELLED" or "dtstart" not in ev:
            continue
        s, all_day = _as_datetime(ev["dtstart"].dt, zone)
        e = _as_datetime(ev["dtend"].dt, zone)[0] if "dtend" in ev else s + (timedelta(days=1) if all_day else timedelta(0))
        item = {
            "id": f"google_{ev.get('uid', '')}_{int(s.timestamp())}",
            "title": str(ev.get("summary", "")) or "(busy)",
            "all_day": all_day,
            "starts_at": s.isoformat(),
            "ends_at": e.isoformat(),
            "busy": not all_day and str(ev.get("transp", "OPAQUE")).upper() != "TRANSPARENT",
            "source": "google",
        }
        if all_day:
            item["start_date"] = s.date().isoformat()
            item["end_date"] = (e.date() - timedelta(days=1)).isoformat() if e.date() > s.date() else s.date().isoformat()
        out.append(item)
    out.sort(key=lambda x: x["starts_at"])
    return out


def google_busy(user, start: datetime, end: datetime) -> list[tuple[datetime, datetime]]:
    return [(datetime.fromisoformat(x["starts_at"]), datetime.fromisoformat(x["ends_at"]))
            for x in google_events(user, start, end) if x["busy"]]


def feed_owner(token: str):
    from app.modules.auth.models import User, UserSettings  # here to keep module imports light

    if not token or len(token) > 64:
        return None
    s = db.session.scalar(db.select(UserSettings).where(UserSettings.calendar_feed_token == token))
    return db.session.get(User, s.user_id) if s else None
