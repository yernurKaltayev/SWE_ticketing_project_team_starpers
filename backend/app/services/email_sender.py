"""Sends one plain-text email over SMTP (MailHog in development)."""

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage

from app.core.config import get_settings

logger = logging.getLogger(__name__)

SMTP_TIMEOUT_SECONDS = 10


def _deliver(message: EmailMessage) -> None:
    settings = get_settings()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=SMTP_TIMEOUT_SECONDS) as smtp:
        if settings.smtp_starttls:
            # The default context verifies the certificate; starttls() alone does not.
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username and settings.smtp_password:
            smtp.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        smtp.send_message(message)


async def send_email(to: str, subject: str, body: str) -> None:
    """Send an email. A delivery failure is logged, never raised: see P9 in the plan."""
    message = EmailMessage()
    message["From"] = get_settings().email_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(body)
    try:
        await asyncio.to_thread(_deliver, message)
    except (OSError, smtplib.SMTPException):
        logger.exception("email delivery failed", extra={"subject": subject})
