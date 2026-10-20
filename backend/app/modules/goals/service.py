"""Goal business rules, including how progress is calculated.

Progress rules (shown to the user in the app, docs/01-database-schema.md §2.3):
- milestones: completed milestone weight ÷ total milestone weight
- tasks:      completed linked tasks ÷ linked tasks. Archived tasks that were never completed are left out
              (dropped work shouldn't count against you); completed ones always count.
- manual:     the value the user last set
No milestones / no linked tasks / no manual value → progress is None ("no data"), never 0.
"""

import uuid
from dataclasses import dataclass

from sqlalchemy import case, func, or_, select

from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.ownership import get_owned_or_404
from app.extensions import db
from app.modules.categories.models import Category
from app.modules.goals.models import Goal, GoalMilestone, GoalProgressUpdate
from app.modules.goals.schemas import GoalCreate, GoalPatch, MilestoneCreate, MilestonePatch, ProgressUpdateCreate
from app.modules.tasks.models import Task


@dataclass
class Progress:
    value: int | None
    tasks_done: int = 0
    tasks_total: int = 0
    milestones_done: int = 0
    milestones_total: int = 0


def _counted_task():
    """Which linked tasks count toward progress (see module docstring)."""
    return or_(Task.archived_at.is_(None), Task.status == "done")


def progress_for(goals: list[Goal]) -> dict[uuid.UUID, Progress]:
    """Progress for many goals with two grouped queries (not one query per goal)."""
    ids = [g.id for g in goals]
    if not ids:
        return {}
    task_rows = db.session.execute(
        select(Task.goal_id, func.count(), func.count().filter(Task.status == "done"))
        .where(Task.goal_id.in_(ids), _counted_task())
        .group_by(Task.goal_id)
    ).all()
    ms_rows = db.session.execute(
        select(
            GoalMilestone.goal_id,
            func.count(),
            func.count(GoalMilestone.completed_at),
            func.sum(GoalMilestone.weight),
            func.coalesce(func.sum(case((GoalMilestone.completed_at.is_not(None), GoalMilestone.weight))), 0),
        )
        .where(GoalMilestone.goal_id.in_(ids))
        .group_by(GoalMilestone.goal_id)
    ).all()
    tasks = {r[0]: (r[2], r[1]) for r in task_rows}
    milestones = {r[0]: (r[2], r[1], r[4], r[3]) for r in ms_rows}

    result = {}
    for g in goals:
        t_done, t_total = tasks.get(g.id, (0, 0))
        m_done, m_total, w_done, w_total = milestones.get(g.id, (0, 0, 0, 0))
        if g.progress_mode == "manual":
            value = g.manual_progress
        elif g.progress_mode == "milestones":
            value = round(100 * w_done / w_total) if w_total else None
        else:
            value = round(100 * t_done / t_total) if t_total else None
        result[g.id] = Progress(value, t_done, t_total, m_done, m_total)
    return result


# ---------- serialisation ----------

def _iso(v):
    return v.isoformat() if v else None


def goal_to_dict(g: Goal, progress: Progress) -> dict:
    return {
        "id": str(g.id),
        "title": g.title,
        "description": g.description,
        "success_criteria": g.success_criteria,
        "category_id": str(g.category_id) if g.category_id else None,
        "horizon": g.horizon,
        "status": g.status,
        "progress_mode": g.progress_mode,
        "manual_progress": g.manual_progress,
        "progress": progress.value,
        "progress_detail": {
            "tasks_done": progress.tasks_done,
            "tasks_total": progress.tasks_total,
            "milestones_done": progress.milestones_done,
            "milestones_total": progress.milestones_total,
        },
        "start_date": _iso(g.start_date),
        "target_date": _iso(g.target_date),
        "completed_at": _iso(g.completed_at),
        "archived_at": _iso(g.archived_at),
        "created_at": _iso(g.created_at),
        "updated_at": _iso(g.updated_at),
    }


def milestone_to_dict(m: GoalMilestone, task_counts: dict) -> dict:
    done, total = task_counts.get(m.id, (0, 0))
    return {
        "id": str(m.id),
        "goal_id": str(m.goal_id),
        "title": m.title,
        "position": m.position,
        "weight": m.weight,
        "target_date": _iso(m.target_date),
        "completed_at": _iso(m.completed_at),
        "tasks_done": done,
        "tasks_total": total,
    }


def update_to_dict(u: GoalProgressUpdate) -> dict:
    return {
        "id": str(u.id),
        "kind": u.kind,
        "progress": u.progress,
        "status": u.status,
        "note": u.note,
        "created_at": _iso(u.created_at),
    }


def goal_detail(g: Goal) -> dict:
    rows = db.session.execute(
        select(Task.milestone_id, func.count().filter(Task.status == "done"), func.count())
        .where(Task.milestone_id.in_([m.id for m in g.milestones]), _counted_task())
        .group_by(Task.milestone_id)
    ).all() if g.milestones else []
    counts = {r[0]: (r[1], r[2]) for r in rows}
    updates = db.session.scalars(
        select(GoalProgressUpdate)
        .where(GoalProgressUpdate.goal_id == g.id)
        .order_by(GoalProgressUpdate.created_at.desc())
        .limit(50)
    ).all()
    return {
        **goal_to_dict(g, progress_for([g])[g.id]),
        "milestones": [milestone_to_dict(m, counts) for m in g.milestones],
        "updates": [update_to_dict(u) for u in updates],
    }


# ---------- progress history ----------

def _last_recorded_progress(goal_id) -> int | None:
    return db.session.scalar(
        select(GoalProgressUpdate.progress)
        .where(GoalProgressUpdate.goal_id == goal_id, GoalProgressUpdate.progress.is_not(None))
        .order_by(GoalProgressUpdate.created_at.desc())
        .limit(1)
    )


def sync_progress(*goal_ids) -> None:
    """Call after anything that can change computed progress (task completed, milestone done, link changed…).
    Adds an "auto" timeline entry when the value moved. The caller commits."""
    ids = {gid for gid in goal_ids if gid}
    if not ids:
        return
    db.session.flush()
    goals = db.session.scalars(select(Goal).where(Goal.id.in_(ids))).all()
    for g, p in ((g, progress_for([g])[g.id]) for g in goals):
        if g.progress_mode != "manual" and p.value is not None and p.value != _last_recorded_progress(g.id):
            db.session.add(GoalProgressUpdate(user_id=g.user_id, goal_id=g.id, kind="auto", progress=p.value))


# ---------- goal writes ----------

def _check_category(category_id) -> None:
    if category_id is not None:
        get_owned_or_404(Category, category_id, "Category")


def list_goals(user, status=None, include_archived=False, archived_only=False) -> list[dict]:
    q = select(Goal).where(Goal.user_id == user.id)
    if archived_only:
        q = q.where(Goal.archived_at.is_not(None))
    elif not include_archived:
        q = q.where(Goal.archived_at.is_(None))
    if status:
        q = q.where(Goal.status == status)
    order = case({"active": 0, "paused": 1, "completed": 2, "abandoned": 3}, value=Goal.status)
    goals = db.session.scalars(q.order_by(order, Goal.target_date.asc().nulls_last(), Goal.created_at.desc())).all()
    progress = progress_for(goals)
    return [goal_to_dict(g, progress[g.id]) for g in goals]


def create_goal(user, data: GoalCreate) -> Goal:
    if data.id and db.session.get(Goal, data.id):
        raise ApiError(409, "conflict", "A goal with this id already exists.")
    _check_category(data.category_id)
    goal = Goal(user_id=user.id, **data.model_dump(exclude_none=True))
    db.session.add(goal)
    db.session.flush()
    if goal.progress_mode == "manual" and goal.manual_progress is not None:
        db.session.add(GoalProgressUpdate(user_id=user.id, goal_id=goal.id, kind="manual", progress=goal.manual_progress))
    db.session.commit()
    return goal


def _set_status(goal: Goal, status: str) -> None:
    if status == goal.status:
        return
    goal.status = status
    goal.completed_at = utcnow() if status == "completed" else None
    db.session.add(GoalProgressUpdate(user_id=goal.user_id, goal_id=goal.id, kind="status", status=status))


def update_goal(user, goal: Goal, data: GoalPatch) -> Goal:
    changes = data.model_dump(exclude_unset=True)
    expected = changes.pop("if_updated_at", None)
    if expected is not None and goal.updated_at != expected:
        raise ApiError(409, "stale_update", "This goal was changed elsewhere since you opened it.",
                       extra={"current": goal_detail(goal)})
    for required in ("title", "horizon", "status", "progress_mode"):
        if required in changes and changes[required] is None:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={required: [{"type": "missing", "message": "Cannot be null"}]})
    if "category_id" in changes:
        _check_category(changes["category_id"])

    status = changes.pop("status", None)
    old_manual = goal.manual_progress
    for field, value in changes.items():
        setattr(goal, field, value)
    if goal.start_date and goal.target_date and goal.target_date < goal.start_date:
        raise ApiError(422, "validation_error", "Some fields are invalid.",
                       fields={"target_date": [{"type": "date_order", "message": "Before start date"}]})
    if status:
        _set_status(goal, status)
    if goal.progress_mode == "manual" and goal.manual_progress is not None and goal.manual_progress != old_manual:
        db.session.add(GoalProgressUpdate(user_id=user.id, goal_id=goal.id, kind="manual", progress=goal.manual_progress))
    sync_progress(goal.id)
    db.session.commit()
    return goal


def add_progress_update(user, goal: Goal, data: ProgressUpdateCreate) -> GoalProgressUpdate:
    if data.progress is not None and goal.progress_mode != "manual":
        raise ApiError(422, "rule_violation",
                       "This goal's progress is calculated automatically. Switch it to manual progress to set a value.")
    if data.progress is not None:
        goal.manual_progress = data.progress
    update = GoalProgressUpdate(
        user_id=user.id, goal_id=goal.id,
        kind="manual" if data.progress is not None else "note",
        progress=data.progress,
        note=data.note.strip() if data.note and data.note.strip() else None,
    )
    db.session.add(update)
    db.session.commit()
    return update


def archive_goal(goal: Goal) -> Goal:
    if goal.archived_at is None:
        goal.archived_at = utcnow()
        db.session.commit()
    return goal


def restore_goal(goal: Goal) -> Goal:
    if goal.archived_at is not None:
        goal.archived_at = None
        db.session.commit()
    return goal


# ---------- milestones ----------

def add_milestone(user, goal: Goal, data: MilestoneCreate) -> GoalMilestone:
    position = data.position
    if position is None:
        position = (db.session.scalar(select(func.max(GoalMilestone.position)).where(GoalMilestone.goal_id == goal.id)) or 0) + 1
    m = GoalMilestone(user_id=user.id, goal_id=goal.id, title=data.title, weight=data.weight,
                      target_date=data.target_date, position=position)
    db.session.add(m)
    sync_progress(goal.id)
    db.session.commit()
    return m


def update_milestone(m: GoalMilestone, data: MilestonePatch) -> GoalMilestone:
    changes = data.model_dump(exclude_unset=True)
    for required in ("title", "weight", "position"):
        if required in changes and changes[required] is None:
            raise ApiError(422, "validation_error", "Some fields are invalid.",
                           fields={required: [{"type": "missing", "message": "Cannot be null"}]})
    for field, value in changes.items():
        setattr(m, field, value)
    sync_progress(m.goal_id)
    db.session.commit()
    return m


def set_milestone_done(m: GoalMilestone, done: bool) -> GoalMilestone:
    if done and m.completed_at is None:
        m.completed_at = utcnow()
    elif not done:
        m.completed_at = None
    sync_progress(m.goal_id)
    db.session.commit()
    return m


def delete_milestone(m: GoalMilestone) -> None:
    linked = db.session.scalar(select(func.count()).select_from(Task).where(Task.milestone_id == m.id))
    if linked:
        raise ApiError(422, "rule_violation", "This milestone has linked tasks. Unlink them first.")
    goal_id = m.goal_id
    db.session.delete(m)
    sync_progress(goal_id)
    db.session.commit()


def milestone_counts(m: GoalMilestone) -> dict:
    row = db.session.execute(
        select(func.count().filter(Task.status == "done"), func.count())
        .where(Task.milestone_id == m.id, _counted_task())
    ).one()
    return {m.id: (row[0], row[1])}
