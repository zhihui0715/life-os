"""Command-line tools. Run from the backend folder, e.g.  flask create-user"""

import getpass
import os

import click
from flask import current_app

from app.modules.auth.service import create_user, set_password


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

    @app.cli.command("set-password")
    @click.option("--email", prompt=True)
    def set_password_cmd(email):
        """Change a password (e.g. forgotten, or after a leak). Signs that account out everywhere."""
        password = getpass.getpass("New password (min 10 characters): ")
        if password != getpass.getpass("Repeat password: "):
            raise click.ClickException("Passwords do not match.")
        try:
            user = set_password(email, password)
        except ValueError as e:
            raise click.ClickException(str(e)) from None
        click.echo(f"Password changed for {user.email}; all its sessions were signed out.")

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

    @app.cli.command("reset-e2e")
    def reset_e2e_cmd():
        """Browser tests only: wipe the *_e2e database, rebuild it and create the test account (E2E_EMAIL/PASSWORD)."""
        from flask_migrate import upgrade
        from sqlalchemy import text

        from app.extensions import db

        name = db.engine.url.database or ""
        if not name.endswith("_e2e"):
            raise click.ClickException(f"Refusing: reset-e2e only runs on a database named *_e2e (this is '{name}').")
        email = os.environ.get("E2E_EMAIL", "e2e@lifeos.test")
        password = os.environ.get("E2E_PASSWORD", "e2e-password-123")
        db.session.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
        db.session.commit()
        upgrade()
        create_user(email, password, "E2E User", "en")
        click.echo(f"Reset {name}; created {email}")

    @app.cli.command("verify-restore")
    @click.option("--source", "source_url", required=True, help="Database the backup was taken from")
    @click.option("--target", "target_url", required=True, help="Database the backup was restored into")
    def verify_restore_cmd(source_url, target_url):
        """Restore drill: prove a restored database matches the original — same schema version, same row count in
        every table, and the same per-user data checksums the backup feature uses. Reads both; changes neither."""
        from sqlalchemy import create_engine, text
        from sqlalchemy.orm import Session

        from app.config import _db_url
        from app.extensions import db
        from app.modules.backup import service

        def summary(url):
            engine = create_engine(_db_url(url))
            with Session(engine) as s:
                version = s.scalar(text("SELECT version_num FROM alembic_version"))
                counts = {t.name: s.scalar(text(f'SELECT count(*) FROM "{t.name}"')) for t in db.metadata.sorted_tables}
                users = [r[0] for r in s.execute(text("SELECT id FROM users ORDER BY email"))]
                # The backup feature's own checksums, computed on this database.
                checksums = {str(u): service._summary(service.snapshot(u, session=s))[1] for u in users}
            engine.dispose()
            return version, counts, checksums

        src, dst = summary(source_url), summary(target_url)
        problems = []
        if src[0] != dst[0]:
            problems.append(f"schema version {src[0]} vs {dst[0]}")
        problems += [f"{t}: {n} rows vs {dst[1].get(t)}" for t, n in src[1].items() if dst[1].get(t) != n]
        if src[2] != dst[2]:
            problems.append("per-user data checksums differ")
        click.echo(f"Schema {src[0]}; {len(src[1])} tables, {sum(src[1].values())} rows; {len(src[2])} account(s).")
        if problems:
            raise click.ClickException("Restore does NOT match:\n  " + "\n  ".join(problems))
        click.echo("Restore verified: every table and every account's checksums match.")
