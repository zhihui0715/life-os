"""Import every model so SQLAlchemy (and Alembic autogenerate) knows about all tables."""

from app.modules.auth.models import AuthSession, User, UserSettings  # noqa: F401
from app.modules.calendar.models import EventException, ScheduleEvent  # noqa: F401
from app.modules.categories.models import Category  # noqa: F401
from app.modules.goals.models import Goal, GoalMilestone, GoalProgressUpdate  # noqa: F401
from app.modules.tasks.models import Tag, Task, task_tags  # noqa: F401
