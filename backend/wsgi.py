"""Entry point for `flask run` (via .flaskenv) and production WSGI servers."""

from app import create_app

app = create_app()
