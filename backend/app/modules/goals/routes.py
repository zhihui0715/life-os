from flask import Blueprint

from app.common.auth import current_user
from app.common.ownership import get_owned_or_404
from app.common.validation import parse_body, parse_query
from app.modules.goals import service
from app.modules.goals.models import Goal, GoalMilestone
from app.modules.goals.schemas import GoalCreate, GoalPatch, GoalQuery, MilestoneCreate, MilestonePatch, ProgressUpdateCreate

bp = Blueprint("goals", __name__, url_prefix="/api/v1")


def _goal(goal_id) -> Goal:
    return get_owned_or_404(Goal, goal_id, "Goal")


def _milestone(milestone_id) -> GoalMilestone:
    return get_owned_or_404(GoalMilestone, milestone_id, "Milestone")


@bp.get("/goals")
def list_goals():
    q = parse_query(GoalQuery)
    return {"items": service.list_goals(current_user(), q.status, q.include_archived, q.archived_only)}


@bp.post("/goals")
def create_goal():
    goal = service.create_goal(current_user(), parse_body(GoalCreate))
    return service.goal_detail(goal), 201


@bp.get("/goals/<goal_id>")
def get_goal(goal_id):
    return service.goal_detail(_goal(goal_id))


@bp.patch("/goals/<goal_id>")
def update_goal(goal_id):
    goal = service.update_goal(current_user(), _goal(goal_id), parse_body(GoalPatch))
    return service.goal_detail(goal)


@bp.post("/goals/<goal_id>/archive")
def archive_goal(goal_id):
    return service.goal_detail(service.archive_goal(_goal(goal_id)))


@bp.post("/goals/<goal_id>/restore")
def restore_goal(goal_id):
    return service.goal_detail(service.restore_goal(_goal(goal_id)))


@bp.post("/goals/<goal_id>/updates")
def add_update(goal_id):
    update = service.add_progress_update(current_user(), _goal(goal_id), parse_body(ProgressUpdateCreate))
    return service.update_to_dict(update), 201


@bp.post("/goals/<goal_id>/milestones")
def add_milestone(goal_id):
    m = service.add_milestone(current_user(), _goal(goal_id), parse_body(MilestoneCreate))
    return service.milestone_to_dict(m, {}), 201


@bp.patch("/milestones/<milestone_id>")
def update_milestone(milestone_id):
    m = service.update_milestone(_milestone(milestone_id), parse_body(MilestonePatch))
    return service.milestone_to_dict(m, service.milestone_counts(m))


@bp.post("/milestones/<milestone_id>/complete")
def complete_milestone(milestone_id):
    m = service.set_milestone_done(_milestone(milestone_id), True)
    return service.milestone_to_dict(m, service.milestone_counts(m))


@bp.post("/milestones/<milestone_id>/reopen")
def reopen_milestone(milestone_id):
    m = service.set_milestone_done(_milestone(milestone_id), False)
    return service.milestone_to_dict(m, service.milestone_counts(m))


@bp.delete("/milestones/<milestone_id>")
def delete_milestone(milestone_id):
    service.delete_milestone(_milestone(milestone_id))
    return "", 204
