"""Streak and consistency rules — pure functions, no database, so every rule is unit-tested.

Rules (also shown in the app):
- A day only counts if the habit was scheduled that day (from its start date, using the schedule in force then).
- done      → extends the streak.
- skipped   → an intentional rest: it neither extends nor breaks the streak, and is left out of consistency.
- missed    → a scheduled day in the past with no check-in: breaks the streak.
- Today is never "missed" — the day isn't over. If you've already checked in, it counts.
- Check-ins on unscheduled days are kept as extras: they don't extend or break the streak.
- "x times per week" habits count in weeks: a week is met when done-count ≥ target. The current week can't break the
  streak until it's over.
- Consistency (last 30 days) = done ÷ (scheduled − skipped). With no eligible days it is None ("no data"), never 0%.
"""

from dataclasses import dataclass
from datetime import date, timedelta

CONSISTENCY_DAYS = 30
CONSISTENCY_WEEKS = 4


@dataclass(frozen=True)
class Schedule:
    effective_from: date
    schedule_type: str  # daily | weekdays | x_per_week
    weekday_mask: int  # Mon=1 … Sun=64
    times_per_week: int


@dataclass
class Stats:
    unit: str  # "days" or "weeks"
    current_streak: int
    best_streak: int
    consistency: float | None  # 0–1, None = no data
    eligible: int  # how many days/weeks consistency is based on
    done_this_week: int
    target_this_week: int | None


def schedule_on(schedules: list[Schedule], day: date) -> Schedule | None:
    current = None
    for s in schedules:  # sorted by effective_from
        if s.effective_from <= day:
            current = s
    return current


def is_scheduled(schedules: list[Schedule], day: date) -> bool:
    s = schedule_on(schedules, day)
    if s is None or s.schedule_type == "x_per_week":
        return False
    if s.schedule_type == "daily":
        return True
    return bool(s.weekday_mask & (1 << day.weekday()))


def week_start(day: date, first_weekday: int) -> date:
    """first_weekday: 1 = Monday … 7 = Sunday (user setting)."""
    offset = (day.isoweekday() - first_weekday) % 7
    return day - timedelta(days=offset)


def _day_stats(schedules, logs, start: date, today: date) -> tuple[int, int, float | None, int]:
    # Walk every scheduled day from the start, oldest first.
    current = best = 0
    day = start
    while day <= today:
        if is_scheduled(schedules, day):
            state = logs.get(day)
            if state == "done":
                current += 1
                best = max(best, current)
            elif state == "skipped" or day == today:
                pass  # rest day, or today still in progress
            else:
                current = 0  # missed
        day += timedelta(days=1)

    window_start = max(start, today - timedelta(days=CONSISTENCY_DAYS - 1))
    done = eligible = 0
    day = window_start
    while day <= today:
        if is_scheduled(schedules, day):
            state = logs.get(day)
            if state == "done":
                done += 1
                eligible += 1
            elif state is None and day < today:
                eligible += 1  # missed
        day += timedelta(days=1)
    return current, best, (done / eligible if eligible else None), eligible


def _week_stats(schedules, logs, start: date, today: date, first_weekday: int):
    this_week = week_start(today, first_weekday)
    current = best = 0
    week = week_start(start, first_weekday)
    met_flags = []  # (week_start, met) for completed weeks
    while week <= this_week:
        s = schedule_on(schedules, max(week, start)) or schedule_on(schedules, week + timedelta(days=6))
        target = s.times_per_week if s and s.schedule_type == "x_per_week" else None
        done = sum(1 for i in range(7) if logs.get(week + timedelta(days=i)) == "done")
        if target is not None:
            met = done >= target
            if week == this_week:
                if met:  # an in-progress week only ever helps
                    current += 1
                    best = max(best, current)
            else:
                met_flags.append(met)
                current = current + 1 if met else 0
                best = max(best, current)
        week += timedelta(days=7)

    recent = met_flags[-CONSISTENCY_WEEKS:]
    consistency = (sum(recent) / len(recent)) if recent else None
    done_now = sum(1 for i in range(7) if logs.get(this_week + timedelta(days=i)) == "done")
    s_now = schedule_on(schedules, today)
    target_now = s_now.times_per_week if s_now and s_now.schedule_type == "x_per_week" else None
    return current, best, consistency, len(recent), done_now, target_now


def compute(schedules: list[Schedule], logs: dict[date, str], start: date, today: date, first_weekday: int = 1) -> Stats:
    s_now = schedule_on(schedules, today) or (schedules[-1] if schedules else None)
    if start > today or s_now is None:
        return Stats("days", 0, 0, None, 0, 0, None)
    this_week = week_start(today, first_weekday)
    done_week = sum(1 for i in range(7) if logs.get(this_week + timedelta(days=i)) == "done")
    if s_now.schedule_type == "x_per_week":
        current, best, consistency, eligible, done_now, target_now = _week_stats(schedules, logs, start, today, first_weekday)
        return Stats("weeks", current, best, consistency, eligible, done_now, target_now)
    current, best, consistency, eligible = _day_stats(schedules, logs, start, today)
    scheduled_this_week = sum(1 for i in range(7) if is_scheduled(schedules, this_week + timedelta(days=i))
                              and this_week + timedelta(days=i) >= start)
    return Stats("days", current, best, consistency, eligible, done_week, scheduled_this_week)
