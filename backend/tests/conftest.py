"""Test setup. Tests use the separate `lifeos_test` database (TEST_DATABASE_URL), never your real data.

Each test run: wipe the test schema → apply all migrations (so migrations are tested too) → run tests,
emptying every table between tests so tests can't affect each other.
"""

import pytest
from flask_migrate import downgrade, upgrade
from sqlalchemy import text

from app import create_app
from app.extensions import db
from app.modules.auth.service import create_user

TEST_PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session")
def app():
    app = create_app("testing")
    with app.app_context():
        db.session.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
        db.session.commit()
        upgrade()
        downgrade(revision="base")  # every migration must be reversible...
        upgrade()  # ...and re-applicable
        yield app
        db.session.remove()


@pytest.fixture(autouse=True)
def _clean_tables(app):
    yield
    db.session.rollback()
    tables = ", ".join(t.name for t in db.metadata.sorted_tables)
    db.session.execute(text(f"TRUNCATE {tables} CASCADE"))
    db.session.commit()


class ApiClient:
    """Flask test client that remembers the CSRF token, like the real frontend does."""

    def __init__(self, client):
        self.client = client
        self.csrf = None

    def login(self, email, password=TEST_PASSWORD):
        res = self.client.post("/api/v1/auth/login", json={"email": email, "password": password})
        if res.status_code == 200:
            self.csrf = res.get_json()["csrf_token"]
        return res

    def _headers(self):
        return {"X-CSRF-Token": self.csrf} if self.csrf else {}

    def get(self, url, **kw):
        return self.client.get(url, **kw)

    def post(self, url, json=None):
        return self.client.post(url, json=json if json is not None else {}, headers=self._headers())

    def patch(self, url, json):
        return self.client.patch(url, json=json, headers=self._headers())

    def put(self, url, json):
        return self.client.put(url, json=json, headers=self._headers())

    def delete(self, url):
        return self.client.delete(url, headers=self._headers())


@pytest.fixture
def user(app):
    return create_user("me@example.test", TEST_PASSWORD, "Me", "en")


@pytest.fixture
def api(app, user):
    """A logged-in API client."""
    c = ApiClient(app.test_client())
    assert c.login(user.email).status_code == 200
    return c


@pytest.fixture
def anon(app):
    return ApiClient(app.test_client())
