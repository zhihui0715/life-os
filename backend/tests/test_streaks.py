"""Unit tests for the streak rules in app/modules/habits/streaks.py (no database needed)."""

from datetime import date, timedelta

from app.modules.habits.streaks import Schedule, compute, is_scheduled, week_start

MON = date(2026, 10, 5)  # a Monday
DAILY = [Schedule(MON, "daily", 127, 7)]
WEEKDAYS = [Schedule(MON, "weekdays", 1 | 2 | 4 | 8 | 16, 7)]  # Mon–Fri


def days(start: date, states: str) -> dict:
    """'d' done, 's' skipped, '.' nothing — one character per day from `start`."""
    out = {}
    for i, ch in enumerate(states):
        if ch == "d":
            out[start + timedelta(days=i)] = "done"
        elif ch == "s":
            out[start + timedelta(days=i)] = "skipped"
    return out


def test_consecutive_done_days_build_a_streak():
    stats = compute(DAILY, days(MON, "dddd"), MON, MON + timedelta(days=3))
    assert (stats.current_streak, stats.best_streak) == (4, 4)


def test_today_unlogged_does_not_break_the_streak():
    stats = compute(DAILY, days(MON, "ddd"), MON, MON + timedelta(days=3))  # day 4 = today, no log yet
    assert stats.current_streak == 3


def test_missed_day_breaks_but_best_is_kept():
    stats = compute(DAILY, days(MON, "ddd.dd"), MON, MON + timedelta(days=5))
    assert (stats.current_streak, stats.best_streak) == (2, 3)


def test_skipped_day_pauses_without_breaking():
    stats = compute(DAILY, days(MON, "dds" + "dd"), MON, MON + timedelta(days=4))
    assert stats.current_streak == 4


def test_unscheduled_days_are_ignored():
    # Mon–Fri done, weekend empty, next Monday done: the weekend is not "missed"
    stats = compute(WEEKDAYS, days(MON, "ddddd..d"), MON, MON + timedelta(days=7))
    assert stats.current_streak == 6


def test_extra_check_in_on_unscheduled_day_does_not_count():
    stats = compute(WEEKDAYS, days(MON, "dddddd"), MON, MON + timedelta(days=5))  # Saturday is extra
    assert stats.current_streak == 5


def test_consistency_excludes_skips_and_today_and_handles_no_data():
    # 10 days: 6 done, 2 skipped, 1 missed, today (day 10) not logged
    stats = compute(DAILY, days(MON, "ddsdd.dsd"), MON, MON + timedelta(days=9))
    assert stats.eligible == 7 and round(stats.consistency, 3) == round(6 / 7, 3)
    empty = compute(DAILY, {}, MON, MON)  # first day, nothing yet
    assert empty.consistency is None and empty.eligible == 0


def test_schedule_change_does_not_rewrite_the_past():
    # Daily for the first week, then weekdays-only from the next Monday.
    schedules = [Schedule(MON, "daily", 127, 7), Schedule(MON + timedelta(days=7), "weekdays", 31, 7)]
    assert is_scheduled(schedules, MON + timedelta(days=5))  # first Saturday: still daily
    assert not is_scheduled(schedules, MON + timedelta(days=12))  # second Saturday: weekdays only
    # First weekend was scheduled (daily) and missed → streak breaks there.
    stats = compute(schedules, days(MON, "ddddd.." + "ddddd"), MON, MON + timedelta(days=11))
    assert (stats.current_streak, stats.best_streak) == (5, 5)


def test_weekly_target_habit_counts_weeks():
    three_a_week = [Schedule(MON, "x_per_week", 127, 3)]
    logs = {**days(MON, "d.d.d.."), **days(MON + timedelta(days=7), "dd....."), **days(MON + timedelta(days=14), "ddd")}
    # Week 1 met, week 2 not met, week 3 (current) already met
    stats = compute(three_a_week, logs, MON, MON + timedelta(days=16))
    assert stats.unit == "weeks"
    assert (stats.current_streak, stats.best_streak) == (1, 1)
    assert (stats.done_this_week, stats.target_this_week) == (3, 3)
    assert stats.consistency == 0.5  # 1 of 2 completed weeks


def test_current_week_in_progress_never_breaks_weekly_streak():
    twice = [Schedule(MON, "x_per_week", 127, 2)]
    logs = days(MON, "dd.....")
    stats = compute(twice, logs, MON, MON + timedelta(days=8))  # Tuesday of week 2, nothing yet
    assert stats.current_streak == 1


def test_week_start_follows_user_setting():
    wed = MON + timedelta(days=2)
    assert week_start(wed, 1) == MON
    assert week_start(wed, 7) == MON - timedelta(days=1)  # Sunday-start week
