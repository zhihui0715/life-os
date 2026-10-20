from typing import Literal

from flask import Blueprint
from pydantic import Field
from sqlalchemy import func, select

from app.common.auth import current_user
from app.common.errors import ApiError
from app.common.models import utcnow
from app.common.ownership import get_owned_or_404
from app.common.validation import InputModel, QueryModel, parse_body, parse_query
from app.extensions import db
from app.modules.categories.models import Category

bp = Blueprint("categories", __name__, url_prefix="/api/v1/categories")


def category_to_dict(c: Category) -> dict:
    return {
        "id": str(c.id),
        "name": c.name,
        "kind": c.kind,
        "color": c.color,
        "archived_at": c.archived_at.isoformat() if c.archived_at else None,
    }


class CategoryCreate(InputModel):
    name: str = Field(min_length=1, max_length=60)
    kind: Literal["general", "learning"] = "general"
    color: str = Field(default="#64748B", pattern=r"^#[0-9A-Fa-f]{6}$")


class CategoryPatch(InputModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    kind: Literal["general", "learning"] | None = None
    color: str | None = Field(default=None, pattern=r"^#[0-9A-Fa-f]{6}$")


class CategoryQuery(QueryModel):
    include_archived: bool = False


def _ensure_unique_name(name: str, exclude_id=None) -> None:
    q = select(Category.id).where(
        Category.user_id == current_user().id, func.lower(Category.name) == name.lower()
    )
    if exclude_id:
        q = q.where(Category.id != exclude_id)
    if db.session.scalar(q):
        raise ApiError(409, "conflict", "A category with this name already exists.", fields={"name": [{"type": "duplicate", "message": "Already exists"}]})


@bp.get("")
def list_categories():
    query = parse_query(CategoryQuery)
    q = select(Category).where(Category.user_id == current_user().id)
    if not query.include_archived:
        q = q.where(Category.archived_at.is_(None))
    items = db.session.scalars(q.order_by(Category.kind, Category.name)).all()
    return {"items": [category_to_dict(c) for c in items]}


@bp.post("")
def create_category():
    data = parse_body(CategoryCreate)
    _ensure_unique_name(data.name)
    c = Category(user_id=current_user().id, **data.model_dump())
    db.session.add(c)
    db.session.commit()
    return category_to_dict(c), 201


@bp.patch("/<category_id>")
def update_category(category_id):
    c = get_owned_or_404(Category, category_id, "Category")
    data = parse_body(CategoryPatch)
    if data.name:
        _ensure_unique_name(data.name, exclude_id=c.id)
    for field, value in data.model_dump(exclude_unset=True, exclude_none=True).items():
        setattr(c, field, value)
    db.session.commit()
    return category_to_dict(c)


@bp.post("/<category_id>/archive")
def archive_category(category_id):
    c = get_owned_or_404(Category, category_id, "Category")
    c.archived_at = c.archived_at or utcnow()
    db.session.commit()
    return category_to_dict(c)


@bp.post("/<category_id>/restore")
def restore_category(category_id):
    c = get_owned_or_404(Category, category_id, "Category")
    c.archived_at = None
    db.session.commit()
    return category_to_dict(c)
