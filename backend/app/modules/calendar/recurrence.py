"""Recurring events: validating RRULEs and expanding a series into concrete occurrences.

Beginner note on time zones: a weekly 09:00 class should stay at 09:00 local time even when the clocks change
(daylight saving). So we expand the rule in the event's own timezone using wall-clock times, and only then
convert each occurrence to UTC. Malaysia has no daylight saving, but travel or another timezone setting would.
"""

import itertools
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from dateutil.rrule import rrule, rrulestr

ALLOWED_FREQ = {"DAILY", "WEEKLY", "MONTHLY", "YEARLY"}
MAX_COUNT = 1000
UTC = timezone.utc


def _parts(text: str) -> dict[str, str]:
    parts = {}
    for piece in text.split(";"):
        if "=" not in piece:
            raise ValueError("Malformed recurrence rule.")
        key, value = piece.split("=", 1)
        parts[key.strip().upper()] = value.strip()
    return parts


def normalise_rrule(text: str) -> str:
    """Accepts "FREQ=WEEKLY;BYDAY=MO,WE" (optionally prefixed with "RRULE:"). Raises ValueError if unsupported."""
    text = text.strip()
    if text.upper().startswith("RRULE:"):
        text = text[6:]
    if not text or len(text) > 300 or "\n" in text:
        raise ValueError("Recurrence rule is empty or too long.")
    parts = _parts(text)
    if parts.get("FREQ") not in ALLOWED_FREQ:
        raise ValueError("Repeat must be daily, weekly, monthly or yearly.")
    if "DTSTART" in parts:
        raise ValueError("DTSTART comes from the event's start time, not the rule.")
    if "COUNT" in parts and "UNTIL" in parts:
        raise ValueError("Use either COUNT or UNTIL, not both.")
    if "COUNT" in parts and not (parts["COUNT"].isdigit() and 1 <= int(parts["COUNT"]) <= MAX_COUNT):
        raise ValueError(f"COUNT must be between 1 and {MAX_COUNT}.")
    # Let dateutil do the full parse; any error means the rule is invalid.
    _rule(text, datetime(2026, 1, 1, 9, 0))
    return ";".join(f"{k}={v}" for k, v in parts.items())


def _rule(text: str, dtstart_local: datetime) -> rrule:
    """UNTIL is treated as a local wall-clock time, matching the naive dtstart."""
    parts = _parts(text)
    if "UNTIL" in parts:
        until = parts["UNTIL"].rstrip("Zz")
        parts["UNTIL"] = until if "T" in until else until + "T235959"
    return rrulestr(";".join(f"{k}={v}" for k, v in parts.items()), dtstart=dtstart_local)


@dataclass(frozen=True)
class Occurrence:
    original_start: datetime  # UTC; identifies the occurrence within its series (used by exceptions)
    starts_at: datetime  # UTC
    ends_at: datetime  # UTC


def _local(dt: datetime, tz: ZoneInfo) -> datetime:
    return dt.astimezone(tz).replace(tzinfo=None)


def _to_utc(local: datetime, tz: ZoneInfo) -> datetime:
    return local.replace(tzinfo=tz).astimezone(UTC)


def expand(starts_at: datetime, ends_at: datetime, tzid: str, rule_text: str | None,
           range_start: datetime, range_end: datetime) -> list[Occurrence]:
    """Occurrences of one event that overlap [range_start, range_end). All datetimes are aware (UTC)."""
    if not rule_text:
        if starts_at < range_end and ends_at > range_start:
            return [Occurrence(starts_at, starts_at, ends_at)]
        return []
    tz = ZoneInfo(tzid)
    start_local = _local(starts_at, tz)
    wall_duration = _local(ends_at, tz) - start_local  # e.g. "1 hour" or "1 day" on the wall clock
    rule = _rule(rule_text, start_local)
    # Widen the lower bound by the duration so an occurrence that started before the range but is still
    # running inside it is included.
    lo = _local(range_start, tz) - wall_duration - timedelta(days=1)
    hi = _local(range_end, tz)
    out = []
    for occ_local in rule.between(lo, hi, inc=True):
        s = _to_utc(occ_local, tz)
        e = _to_utc(occ_local + wall_duration, tz)
        if s < range_end and e > range_start:
            out.append(Occurrence(s, s, e))
    return out


def series_end(starts_at: datetime, ends_at: datetime, tzid: str, rule_text: str | None) -> datetime | None:
    """End of the last occurrence, or None when the series repeats forever."""
    if not rule_text:
        return ends_at
    parts = _parts(rule_text)
    if "COUNT" not in parts and "UNTIL" not in parts:
        return None
    tz = ZoneInfo(tzid)
    start_local = _local(starts_at, tz)
    wall_duration = _local(ends_at, tz) - start_local
    last = None
    for last in itertools.islice(_rule(rule_text, start_local), MAX_COUNT * 40):
        pass
    if last is None:  # e.g. UNTIL before the first start: the series is empty
        return ends_at
    return _to_utc(last + wall_duration, tz)


def is_occurrence(starts_at: datetime, ends_at: datetime, tzid: str, rule_text: str, original_start: datetime) -> bool:
    """True if `original_start` is a real occurrence start of this series."""
    window = expand(starts_at, ends_at, tzid, rule_text, original_start, original_start + timedelta(seconds=1))
    return any(o.original_start == original_start for o in window)
