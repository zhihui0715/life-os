import uuid

from app.extensions import db
from app.modules.categories.models import Category

# Seeded once, in the user's language at account creation. Afterwards they are ordinary, editable user data.
DEFAULT_CATEGORIES = [
    # (kind, color, English, Simplified Chinese)
    ("learning", "#4F46E5", "Programming", "编程"),
    ("learning", "#0EA5E9", "Cybersecurity", "网络安全"),
    ("learning", "#8B5CF6", "Study", "学习"),
    ("learning", "#14B8A6", "Reading", "阅读"),
    ("general", "#F59E0B", "Work", "工作"),
    ("general", "#22C55E", "Health", "健康"),
    ("general", "#EC4899", "Personal", "个人"),
]


def seed_default_categories(user_id: uuid.UUID, locale: str) -> None:
    for kind, color, en, zh in DEFAULT_CATEGORIES:
        db.session.add(Category(user_id=user_id, kind=kind, color=color, name=zh if locale == "zh-CN" else en))
