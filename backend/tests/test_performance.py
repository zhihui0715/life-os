"""Stage 9 performance budget for the API: with a year of realistic data, the screens people open daily still answer
quickly. Budgets are generous (CI machines are slow); they catch accidental N+1 queries and missing indexes, not
milliseconds. Each endpoint is timed three times and the median is compared.
"""

import random
import statistics
import time
import uuid
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

import pytest

from app.extensions import db
from app.modules.activity.models import ActivityLog
from app.modules.habits.models import Habit, HabitLog, HabitScheduleChange
from app.modules.journal.models import JournalEntry
from app.modules.tasks.models import Task

KL = ZoneInfo("Asia/Kuala_Lumpur")
DAYS = 365

BUDGET_MS = {
    "/api/v1/tasks?view=today&limit=50": 400,
    "/api/v1/tasks?view=all&limit=50": 400,
    "/api/v1/habits": 600,
    "/api/v1/insights/overview?period=week&offset=0": 800,
    "/api/v1/insights/overview?period=month&offset=0": 1000,
    "/api/v1/insights/trend?weeks=8": 1500,
    "/api/v1/journal?limit=60": 400,
    "/api/v1/backup/export": 4000,
}


@pytest.fixture
def year_of_data(user):
    rnd = random.Random(7)
    today = datetime.now(KL).date()
    now = datetime.now(timezone.utc)
    rows = []
    for i in range(2000):  # ~5 tasks a day for a year
        done = rnd.random() < 0.8
        created = now - timedelta(days=rnd.randrange(DAYS))
        rows.append(Task(user_id=user.id, title=f"Task {i}", status="done" if done else rnd.choice(["inbox", "todo"]),
                         priority=rnd.randint(1, 4), due_date=today + timedelta(days=rnd.randint(-30, 30)),
                         estimate_minutes=rnd.choice([None, 30, 60]), created_at=created,
                         completed_at=created + timedelta(hours=5) if done else None))
    for h in range(6):
        habit = Habit(id=uuid.uuid4(), user_id=user.id, name=f"Habit {h}", start_date=today - timedelta(days=DAYS))
        habit.schedules.append(HabitScheduleChange(effective_from=habit.start_date, schedule_type="daily",
                                                   weekday_mask=127, times_per_week=7))
        rows.append(habit)
        rows += [HabitLog(user_id=user.id, habit_id=habit.id, log_date=today - timedelta(days=d), state="done")
                 for d in range(DAYS) if rnd.random() < 0.7]
    rows += [JournalEntry(user_id=user.id, entry_date=today - timedelta(days=d), body="Note " * 80,
                          mood=rnd.randint(1, 5), energy=rnd.randint(1, 5)) for d in range(DAYS)]
    rows += [ActivityLog(user_id=user.id, title="Study", log_date=today - timedelta(days=d % DAYS),
                         duration_minutes=rnd.randint(10, 120)) for d in range(1000)]
    db.session.add_all(rows)
    db.session.commit()


@pytest.mark.parametrize("url", list(BUDGET_MS))
def test_daily_screens_stay_fast_with_a_year_of_data(api, year_of_data, url):
    timings = []
    for _ in range(3):
        start = time.perf_counter()
        res = api.get(url)
        timings.append((time.perf_counter() - start) * 1000)
        assert res.status_code == 200, res.get_json()
    median = statistics.median(timings)
    assert median <= BUDGET_MS[url], f"{url}: {median:.0f} ms (budget {BUDGET_MS[url]} ms)"
