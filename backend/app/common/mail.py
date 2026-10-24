"""Sending email over SMTP (reports by email). Off unless the server is given an SMTP account in its environment:

    SMTP_HOST=smtp.example.com   SMTP_PORT=587   SMTP_USER=…   SMTP_PASSWORD=…
    SMTP_FROM="Life OS <reports@example.com>"   SMTP_SECURITY=starttls   (or "ssl" for port 465, or "none")

Nothing else in the app sends mail.
"""

import smtplib
import ssl
from email.message import EmailMessage

from flask import current_app


def mail_configured() -> bool:
    c = current_app.config
    return bool(c.get("SMTP_HOST") and c.get("SMTP_FROM"))


def send_mail(to: str, subject: str, text: str, html: str | None = None, attachments: list[tuple[str, bytes, str]] = ()) -> None:
    """Sends one message. `attachments`: (filename, bytes, "type/subtype"). Raises on failure."""
    c = current_app.config
    msg = EmailMessage()
    msg["From"] = c["SMTP_FROM"]
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(text)
    if html:
        msg.add_alternative(html, subtype="html")
    for name, body, mimetype in attachments:
        maintype, subtype = mimetype.split("/", 1)
        msg.add_attachment(body, maintype=maintype, subtype=subtype, filename=name)

    host, port = c["SMTP_HOST"], int(c.get("SMTP_PORT") or 587)
    security = (c.get("SMTP_SECURITY") or "starttls").lower()
    context = ssl.create_default_context()
    if security == "ssl":
        server = smtplib.SMTP_SSL(host, port, context=context, timeout=30)
    else:
        server = smtplib.SMTP(host, port, timeout=30)
    with server:
        if security == "starttls":
            server.starttls(context=context)
        if c.get("SMTP_USER"):
            server.login(c["SMTP_USER"], c.get("SMTP_PASSWORD") or "")
        server.send_message(msg)
