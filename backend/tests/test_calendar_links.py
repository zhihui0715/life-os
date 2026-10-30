"""Calendar links with Google: the private feed out, a Google calendar's events in (calendar/links.py)."""

import urllib.error
from datetime import timedelta

import pytest

from app.modules.calendar import links
from tests.test_calendar import EVERY_DAY_9_TO_12, at, day, rng, utc_local

GOOGLE_URL = "https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc123/basic.ics"


@pytest.fixture(autouse=True)
def _fresh_cache():
    links._cache.clear()
    yield
    links._cache.clear()


def fake_google(monkeypatch, d, calls=None):
    """A Google calendar with a timed meeting on day `d` (10:00–11:00 KL, weekly) and an all-day trip."""
    ics = f"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:meeting@google.com
DTSTART;TZID=Asia/Kuala_Lumpur:{d:%Y%m%d}T100000
DTEND;TZID=Asia/Kuala_Lumpur:{d:%Y%m%d}T110000
RRULE:FREQ=WEEKLY
SUMMARY:Team meeting
END:VEVENT
BEGIN:VEVENT
UID:trip@google.com
DTSTART;VALUE=DATE:{d:%Y%m%d}
DTEND;VALUE=DATE:{d + timedelta(days=2):%Y%m%d}
SUMMARY:Trip
END:VEVENT
END:VCALENDAR
""".replace("\n", "\r\n").encode()

    def download(url):
        assert url == GOOGLE_URL
        if calls is not None:
            calls.append(url)
        return ics

    monkeypatch.setattr(links, "_download", download)


def test_the_feed_is_off_until_asked_for_and_needs_no_sign_in(api, anon):
    assert api.get("/api/v1/calendar/links").get_json() == {"feed_url": None, "google": "off", "google_problem": None}
    d = day(2)
    api.post("/api/v1/calendar/events", {"title": "Dentist", "starts_at": at(d, 9), "ends_at": at(d, 10)})
    api.post("/api/v1/tasks", {"title": "Send report", "status": "todo", "due_date": d.isoformat()})

    url = api.post("/api/v1/calendar/links/feed").get_json()["feed_url"]
    path = url.split("://", 1)[1].split("/", 1)[1]
    res = anon.get(f"/{path}")  # Google fetches it without a session
    assert res.status_code == 200 and res.mimetype == "text/calendar"
    body = res.get_data(as_text=True)
    assert "SUMMARY:Dentist" in body and "SUMMARY:☐ Send report" in body and "X-WR-CALNAME:Life OS" in body

    # A new address replaces the old one at once; switching off stops it.
    new_url = api.post("/api/v1/calendar/links/feed").get_json()["feed_url"]
    assert new_url != url and anon.get(f"/{path}").status_code == 404
    api.delete("/api/v1/calendar/links/feed")
    assert anon.get("/" + new_url.split("://", 1)[1].split("/", 1)[1]).status_code == 404
    assert anon.get("/api/v1/calendar/feed/not-a-token.ics").status_code == 404


@pytest.mark.parametrize("bad", [
    "http://calendar.google.com/calendar/ical/x/basic.ics",  # not https
    "https://evil.example.com/calendar/ical/x/basic.ics",  # not Google
    "https://calendar.google.com.evil.example/calendar/ical/x/basic.ics",
    "https://user@calendar.google.com/calendar/ical/x/basic.ics",
    "https://calendar.google.com:8443/calendar/ical/x/basic.ics",
    "https://calendar.google.com/calendar/embed?src=x",  # the public page, not the iCal address
    "https://127.0.0.1/calendar/ical/x/basic.ics",
])
def test_only_googles_own_ical_addresses_are_accepted(api, bad):
    res = api.put("/api/v1/calendar/links/google", {"url": bad})
    assert res.status_code == 422 and res.get_json()["error"]["fields"]["url"][0]["type"] == "invalid_google_ics"


def test_google_events_show_on_the_calendar_and_count_as_busy(api, monkeypatch):
    d = day(3)
    calls = []
    fake_google(monkeypatch, d, calls)
    assert api.put("/api/v1/calendar/links/google", {"url": GOOGLE_URL}).get_json()["google"] == "ok"

    data = api.get(f"/api/v1/calendar/occurrences?{rng(d, d + timedelta(days=8))}").get_json()
    google = data["external"]
    meetings = [g for g in google if g["title"] == "Team meeting"]
    assert len(meetings) == 2 and utc_local(meetings[0]["starts_at"]) == f"{d} 10:00"  # the weekly repeat too
    trip = next(g for g in google if g["title"] == "Trip")
    assert trip["all_day"] and trip["start_date"] == d.isoformat() and trip["end_date"] == (d + timedelta(days=1)).isoformat()
    assert not trip["busy"] and meetings[0]["busy"]

    api.patch("/api/v1/settings", {"working_hours": EVERY_DAY_9_TO_12})
    slots = api.get(f"/api/v1/calendar/free-slots?{rng(d, d + timedelta(days=1))}&min_minutes=30").get_json()["items"]
    assert [(utc_local(s["starts_at"])[-5:], utc_local(s["ends_at"])[-5:]) for s in slots] == [("09:00", "10:00"), ("11:00", "12:00")]
    assert len(calls) == 1  # read once, then from the cache

    api.delete("/api/v1/calendar/links/google")
    assert api.get(f"/api/v1/calendar/occurrences?{rng(d, d + timedelta(days=1))}").get_json()["external"] == []


PUBLIC_URL = "https://calendar.google.com/calendar/ical/me%40gmail.com/public/basic.ics"


def http_error(code):
    def fail(url):
        raise urllib.error.HTTPError(url, code, "error", {}, None)
    return fail


@pytest.mark.parametrize(("url", "download", "problem"), [
    (PUBLIC_URL, http_error(404), "public_not_shared"),  # the usual mistake: the public address of a private calendar
    (GOOGLE_URL, http_error(404), "not_found"),
    (GOOGLE_URL, http_error(403), "denied"),
    (GOOGLE_URL, http_error(503), "google_busy"),
    (GOOGLE_URL, http_error(302), "unreachable"),  # a redirect is never followed
    (GOOGLE_URL, lambda url: (_ for _ in ()).throw(TimeoutError()), "timeout"),
    (GOOGLE_URL, lambda url: (_ for _ in ()).throw(urllib.error.URLError(TimeoutError())), "timeout"),
    (GOOGLE_URL, lambda url: (_ for _ in ()).throw(OSError("network down")), "unreachable"),
    (GOOGLE_URL, lambda url: (_ for _ in ()).throw(links._TooLarge()), "too_large"),
    (GOOGLE_URL, lambda url: b"<html>Sign in</html>", "not_calendar"),
])
def test_a_google_calendar_that_cant_be_read_says_why_and_shows_nothing(api, monkeypatch, url, download, problem):
    monkeypatch.setattr(links, "_download", download)
    res = api.put("/api/v1/calendar/links/google", {"url": url}).get_json()
    assert (res["google"], res["google_problem"]) == ("error", problem)
    d = day(1)
    assert api.get(f"/api/v1/calendar/occurrences?{rng(d, d + timedelta(days=1))}").get_json()["external"] == []


def test_backups_never_contain_the_calendar_links(api, monkeypatch):
    fake_google(monkeypatch, day(1))
    api.post("/api/v1/calendar/links/feed")
    api.put("/api/v1/calendar/links/google", {"url": GOOGLE_URL})
    settings = api.get("/api/v1/backup/export").get_json()["data"]["user_settings"][0]
    assert "calendar_feed_token" not in settings and "google_ics_url" not in settings
