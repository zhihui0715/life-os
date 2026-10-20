"""Command-line tools. Run from the backend folder, e.g.  flask create-user"""

import getpass
import os

import click
from flask import current_app

from app.modules.auth.service import create_user


def register_cli(app) -> None:
    @app.cli.command("create-user")
    @click.option("--email", prompt=True)
    @click.option("--name", "display_name", prompt="Display name")
    @click.option("--locale", type=click.Choice(["en", "zh-CN"]), default="en", show_default=True)
    def create_user_cmd(email, display_name, locale):
        """Create your account. The password is typed privately and never shown."""
        password = getpass.getpass("Password (min 10 characters): ")
        if password != getpass.getpass("Repeat password: "):
            raise click.ClickException("Passwords do not match.")
        try:
            user = create_user(email, password, display_name, locale)
        except ValueError as e:
            raise click.ClickException(str(e)) from None
        click.echo(f"Created user {user.email}")

    @app.cli.command("seed-dev-user")
    def seed_dev_user_cmd():
        """Development only: create the test account from DEV_USER_EMAIL / DEV_USER_PASSWORD in .env."""
        if current_app.config.get("ENV_NAME") != "development":
            raise click.ClickException("seed-dev-user only runs with APP_ENV=development.")
        email, password = os.environ.get("DEV_USER_EMAIL"), os.environ.get("DEV_USER_PASSWORD")
        if not email or not password:
            raise click.ClickException("Set DEV_USER_EMAIL and DEV_USER_PASSWORD in .env first.")
        try:
            create_user(email, password, "Dev User", "en")
        except ValueError as e:
            raise click.ClickException(str(e)) from None
        click.echo(f"Created development user {email} (password is in .env)")
