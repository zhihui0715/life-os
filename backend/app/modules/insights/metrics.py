"""Every insight formula lives here (read-only; nothing is written). Each function covers a period of local days
[start, end] and only looks at days up to today. Missing data is returned as None — never as 0.

Formulas (the same text is shown in the app next to each number):
- Task execution: tasks due in the period that were done on time ÷ tasks due in the period.
  "Due" = due date (or the local day of the deadline). On time = completed before the deadline, or by the end of
  the due date. A task due today that isn't done yet isn't counted until the day is over. Subtasks and archived
  unfinished tasks are left out.
- Habits: done ÷ (scheduled − skipped) over all active habits, using the streak rules (missed is computed; today
  counts only once logged). "N per week" habits contribute min(done, target) of target for each week that has
  ended or already met its target.
- Learning: minutes logged in categories of kind "learning" ÷ your weekly target, prorated to the days elapsed,
  capped at 100%. No target set → no data (the minutes are still shown).
- Goals on track: for each active goal with progress and a target date, progress ÷ the share of time elapsed between
  its start and target date, capped at 100%; averaged over goals. Goals whose time hasn't started yet are left out.
- Goals & learning component = the average of whichever of "learning" and "goals on track" has data.
- Wellbeing: average of each day's mood/energy (1–5, rescaled to 0–100). Needs at least 3 check-in days.
- Life Balance Score = Σ weight × component ÷ Σ weight, over enabled components that have data. Coverage = the
  share of enabled weight that had data. Each behaviour is counted in one component only: habits only in
  Habits, tasks only in Tasks, logged minutes only in Learning.
"""

from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta

from sqlalchemy import and_, func, or_, select

from app.common.timeutil import user_today, user_zone
from app.extensions import db
from app.modules.activity.models import ActivityLog, FocusSession
from app.modules.auth.models import DEFAULT_SCORE_WEIGHTS, SCORE_COMPONENTS
from app.modules.categories.models import Category
from app.modules.goals.models import Goal
from app.modules.goals.service import progress_for
from app.modules.habits.models import Habit, HabitLog
from app.modules.habits.streaks import Schedule, is_scheduled, schedule_on, week_start
from app.modules.journal.models import JournalEntry
from app.modules.tasks.models import Task

MIN_MOOD_DAYS = 3


@dataclass
class Period:
    start: date
    end: date  # inclusive
    today: date

    @property
    def last(self) -> date:
        """Last day that can have data (periods may extend into the future)."""
        return min(self.end, self.today)

    @property
    def elapsed_days(self) -> int:
        return max((self.last - self.start).days + 1, 0)

    def days(self):
        d = self.start
        while d <= self.last:
            yield d
            d += timedelta(days=1)


@dataclass
class Component:
    key: str
    score: float | None  # 0–100
    detail: dict = field(default_factory=dict)


def _ratio(num, den):
    return (num / den) if den else None


def _pct(r):
    return round(100 * r, 1) if r is not None else None


# ---------- tasks ----------

def tasks_metric(user, p: Period) -> Component:
    zone = user_zone(user)
    lo = datetime.combine(p.start, time.min, zone)
    hi = datetime.combine(p.last + timedelta(days=1), time.min, zone)
    tasks = db.session.scalars(
        select(Task).where(
            Task.user_id == user.id, Task.parent_task_id.is_(None),
            or_(Task.archived_at.is_(None), Task.status == "done"),
            or_(and_(Task.due_date >= p.start, Task.due_date <= p.last),
                and_(Task.due_date.is_(None), Task.deadline >= lo, Task.deadline < hi)),
        )
    ).all()
    counted = on_time = late = 0
    for t in tasks:
        end = t.deadline or datetime.combine(t.due_date + timedelta(days=1), time.min, zone)
        day = t.due_date or t.deadline.astimezone(zone).date()
        if t.status == "done":
            counted += 1
            if t.completed_at <= end:
                on_time += 1
            else:
                late += 1
        elif day < p.today:
            counted += 1  # due and not done: missed
    completed = db.session.scalar(
        select(func.count()).select_from(Task).where(Task.user_id == user.id, Task.completed_at >= lo, Task.completed_at < hi)
    )
    created = db.session.scalar(
        select(func.count()).select_from(Task).where(Task.user_id == user.id, Task.created_at >= lo, Task.created_at < hi)
    )
    ratio = _ratio(on_time, counted)
    return Component("tasks", _pct(ratio), {
        "due": counted, "on_time": on_time, "late": late, "missed": counted - on_time - late,
        "completed": completed, "created": created, "rate": _pct(ratio),
    })


def estimate_accuracy(user, p: Period) -> dict:
    """Completed tasks with an estimate and some recorded time: actual ÷ estimated (1.0 = spot on)."""
    zone = user_zone(user)
    lo = datetime.combine(p.start, time.min, zone)
    hi = datetime.combine(p.last + timedelta(days=1), time.min, zone)
    tracked = (
        select(ActivityLog.task_id, func.sum(ActivityLog.duration_minutes).label("m"))
        .where(ActivityLog.task_id.is_not(None)).group_by(ActivityLog.task_id).subquery()
    )
    rows = db.session.execute(
        select(Task.estimate_minutes, func.coalesce(Task.actual_minutes_manual, tracked.c.m))
        .outerjoin(tracked, tracked.c.task_id == Task.id)
        .where(Task.user_id == user.id, Task.completed_at >= lo, Task.completed_at < hi, Task.estimate_minutes > 0)
    ).all()
    pairs = [(e, a) for e, a in rows if a]
    est, act = sum(e for e, _ in pairs), sum(a for _, a in pairs)
    return {"tasks": len(pairs), "estimated_minutes": est, "actual_minutes": int(act),
            "ratio": round(act / est, 2) if est else None}


# ---------- habits ----------

def habits_metric(user, p: Period) -> Component:
    habits = db.session.scalars(
        select(Habit).where(Habit.user_id == user.id, Habit.archived_at.is_(None), Habit.start_date <= p.last)
    ).all()
    logs: dict = {h.id: {} for h in habits}
    if habits:
        for lg in db.session.scalars(select(HabitLog).where(
                HabitLog.habit_id.in_(list(logs)), HabitLog.log_date >= p.start - timedelta(days=6), HabitLog.log_date <= p.last)):
            logs[lg.habit_id][lg.log_date] = lg.state
    done = eligible = 0
    per_day: dict[date, list[int]] = {d: [0, 0] for d in p.days()}
    first_weekday = user.settings.week_start
    for h in habits:
        sched = [Schedule(s.effective_from, s.schedule_type, s.weekday_mask, s.times_per_week) for s in h.schedules]
        hl = logs[h.id]
        for d in p.days():
            if d < h.start_date:
                continue
            s = schedule_on(sched, d)
            if s is None or s.schedule_type == "x_per_week" or not is_scheduled(sched, d):
                continue
            state = hl.get(d)
            if state == "done":
                done += 1
                eligible += 1
                per_day[d][0] += 1
                per_day[d][1] += 1
            elif state is None and d < p.today:
                eligible += 1
                per_day[d][1] += 1
        # weekly-target habits: weeks overlapping the period
        wk = week_start(max(p.start, h.start_date), first_weekday)
        while wk <= p.last:
            s = schedule_on(sched, max(wk, h.start_date))
            if s and s.schedule_type == "x_per_week":
                n = sum(1 for i in range(7) if hl.get(wk + timedelta(days=i)) == "done")
                week_over = wk + timedelta(days=6) < p.today
                if week_over or n >= s.times_per_week:
                    eligible += s.times_per_week
                    done += min(n, s.times_per_week)
            wk += timedelta(days=7)
    ratio = _ratio(done, eligible)
    return Component("habits", _pct(ratio), {
        "habits": len(habits), "done": done, "eligible": eligible, "rate": _pct(ratio),
        "daily": [{"date": d.isoformat(), "rate": _pct(_ratio(*v))} for d, v in per_day.items()],
    })


# ---------- learning & goals ----------

def learning_minutes(user, p: Period) -> tuple[int, list]:
    rows = db.session.execute(
        select(ActivityLog.log_date, func.sum(ActivityLog.duration_minutes))
        .join(Category, Category.id == ActivityLog.category_id)
        .where(ActivityLog.user_id == user.id, Category.kind == "learning",
               ActivityLog.log_date >= p.start, ActivityLog.log_date <= p.last)
        .group_by(ActivityLog.log_date)
    ).all()
    by_day = {r[0]: int(r[1]) for r in rows}
    return sum(by_day.values()), [{"date": d.isoformat(), "minutes": by_day.get(d, 0)} for d in p.days()]


def goals_on_track(user, p: Period) -> tuple[float | None, list]:
    goals = db.session.scalars(
        select(Goal).where(Goal.user_id == user.id, Goal.status == "active", Goal.archived_at.is_(None),
                           Goal.target_date.is_not(None))
    ).all()
    progress = progress_for(goals)
    items = []
    for g in goals:
        value = progress[g.id].value
        if value is None:
            continue
        start = g.start_date or g.created_at.astimezone(user_zone(user)).date()
        span = (g.target_date - start).days
        expected = 1.0 if span <= 0 else min(max((p.last - start).days / span, 0.0), 1.0)
        if expected == 0:
            continue  # no time has passed yet: there's nothing to judge, so it isn't scored (not 100%, not 0%)
        on_track = min(value / 100 / expected, 1.0)
        items.append({"goal_id": str(g.id), "title": g.title, "progress": value,
                      "expected": round(100 * expected, 1), "on_track": round(100 * on_track, 1)})
    if not items:
        return None, []
    return sum(i["on_track"] for i in items) / len(items) / 100, items


def goals_learning_metric(user, p: Period) -> Component:
    minutes, daily = learning_minutes(user, p)
    weekly_target = user.settings.weekly_learning_target_min
    target = round(weekly_target * p.elapsed_days / 7) if weekly_target else None
    learning = min(minutes / target, 1.0) if target else None
    goals, goal_items = goals_on_track(user, p)
    parts = [x for x in (learning, goals) if x is not None]
    score = _pct(sum(parts) / len(parts)) if parts else None
    return Component("goals_learning", score, {
        "learning_minutes": minutes, "learning_target_minutes": target, "learning_rate": _pct(learning),
        "goals_on_track": _pct(goals), "goals": goal_items, "daily_learning": daily,
    })


# ---------- wellbeing ----------

def wellbeing_metric(user, p: Period) -> Component:
    rows = db.session.execute(
        select(JournalEntry.entry_date, JournalEntry.mood, JournalEntry.energy)
        .where(JournalEntry.user_id == user.id, JournalEntry.entry_date >= p.start, JournalEntry.entry_date <= p.last,
               or_(JournalEntry.mood.is_not(None), JournalEntry.energy.is_not(None)))
        .order_by(JournalEntry.entry_date)
    ).all()
    day_values = []
    for _, mood, energy in rows:
        vals = [v for v in (mood, energy) if v is not None]
        day_values.append(sum(vals) / len(vals))
    moods = [r[1] for r in rows if r[1] is not None]
    energies = [r[2] for r in rows if r[2] is not None]
    enough = len(day_values) >= MIN_MOOD_DAYS
    score = _pct((sum(day_values) / len(day_values) - 1) / 4) if enough else None
    return Component("wellbeing", score, {
        "check_in_days": len(day_values), "min_days": MIN_MOOD_DAYS,
        "average_mood": round(sum(moods) / len(moods), 2) if moods else None,
        "average_energy": round(sum(energies) / len(energies), 2) if energies else None,
        "daily": [{"date": r[0].isoformat(), "mood": r[1], "energy": r[2]} for r in rows],
    })


# ---------- focus & time ----------

def focus_metric(user, p: Period) -> dict:
    zone = user_zone(user)
    lo = datetime.combine(p.start, time.min, zone)
    hi = datetime.combine(p.last + timedelta(days=1), time.min, zone)
    rows = db.session.execute(
        select(FocusSession.state, func.count(), func.coalesce(func.sum(FocusSession.actual_minutes), 0))
        .where(FocusSession.user_id == user.id, FocusSession.started_at >= lo, FocusSession.started_at < hi,
               FocusSession.state.in_(("completed", "interrupted")))
        .group_by(FocusSession.state)
    ).all()
    by = {r[0]: (r[1], int(r[2])) for r in rows}
    return {"completed": by.get("completed", (0, 0))[0], "interrupted": by.get("interrupted", (0, 0))[0],
            "minutes": sum(m for _, m in by.values())}


def time_allocation(user, p: Period) -> dict:
    rows = db.session.execute(
        select(ActivityLog.category_id, Category.name, Category.color, Category.kind, func.sum(ActivityLog.duration_minutes))
        .outerjoin(Category, Category.id == ActivityLog.category_id)
        .where(ActivityLog.user_id == user.id, ActivityLog.log_date >= p.start, ActivityLog.log_date <= p.last)
        .group_by(ActivityLog.category_id, Category.name, Category.color, Category.kind)
    ).all()
    items = sorted(({"category_id": str(r[0]) if r[0] else None, "name": r[1], "color": r[2], "kind": r[3],
                     "minutes": int(r[4])} for r in rows), key=lambda x: -x["minutes"])
    return {"total_minutes": sum(i["minutes"] for i in items), "by_category": items}


# ---------- score ----------

def weights(user) -> dict:
    return user.settings.score_weights or DEFAULT_SCORE_WEIGHTS


def life_balance(user, components: dict[str, Component]) -> dict:
    w = weights(user)
    enabled = w.get("enabled", {})
    total_enabled = sum(w[k] for k in SCORE_COMPONENTS if enabled.get(k, True))
    with_data = [k for k in SCORE_COMPONENTS if enabled.get(k, True) and w[k] > 0 and components[k].score is not None]
    used_weight = sum(w[k] for k in with_data)
    value = round(sum(w[k] * components[k].score for k in with_data) / used_weight, 1) if used_weight else None
    return {
        "value": value,
        "coverage": round(100 * used_weight / total_enabled, 1) if total_enabled else 0.0,
        "components": [
            {
                "key": k, "weight": w[k], "enabled": enabled.get(k, True), "score": components[k].score,
                "has_data": components[k].score is not None,
                "effective_weight": round(100 * w[k] / used_weight, 1) if k in with_data else 0.0,
            }
            for k in SCORE_COMPONENTS
        ],
    }


def compute_period(user, p: Period, full: bool = True) -> dict:
    comps = {
        "tasks": tasks_metric(user, p),
        "goals_learning": goals_learning_metric(user, p),
        "habits": habits_metric(user, p),
        "wellbeing": wellbeing_metric(user, p),
    }
    out = {
        "period": {"start": p.start.isoformat(), "end": p.end.isoformat(), "elapsed_days": p.elapsed_days},
        "score": life_balance(user, comps),
        "components": {k: {"score": c.score, **c.detail} for k, c in comps.items()},
    }
    if full:
        out["focus"] = focus_metric(user, p)
        out["estimates"] = estimate_accuracy(user, p)
        out["time"] = time_allocation(user, p)
    return out


def period_for(user, kind: str, offset: int) -> Period:
    today = user_today(user)
    if kind == "month":
        y, m = today.year, today.month + offset
        y += (m - 1) // 12
        m = (m - 1) % 12 + 1
        start = date(y, m, 1)
        end = (date(y + (m == 12), m % 12 + 1, 1)) - timedelta(days=1)
    else:
        start = week_start(today, user.settings.week_start) + timedelta(weeks=offset)
        end = start + timedelta(days=6)
    return Period(start, end, today)


def trend(user, weeks: int) -> list[dict]:
    out = []
    for offset in range(-(weeks - 1), 1):
        p = period_for(user, "week", offset)
        r = compute_period(user, p, full=False)
        c = r["components"]
        out.append({
            "start": r["period"]["start"], "end": r["period"]["end"], "score": r["score"]["value"],
            "coverage": r["score"]["coverage"],
            "tasks": c["tasks"]["score"], "habits": c["habits"]["score"],
            "goals_learning": c["goals_learning"]["score"], "wellbeing": c["wellbeing"]["score"],
            "learning_minutes": c["goals_learning"]["learning_minutes"],
            "average_mood": c["wellbeing"]["average_mood"],
        })
    return out
