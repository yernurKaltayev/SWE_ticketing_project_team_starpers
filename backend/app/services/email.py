"""SMTP transport: Mailpit locally, configurable SMTP with STARTTLS elsewhere."""

import asyncio
import logging
import smtplib
import ssl
from email.message import EmailMessage
from urllib.parse import urlencode

from app.core.config import settings
from app.models.token import TokenPurpose

logger = logging.getLogger(__name__)


def _send(message: EmailMessage) -> None:
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as smtp:
        if settings.smtp_starttls:
            smtp.starttls(context=ssl.create_default_context())
        if settings.smtp_username:
            smtp.login(
                settings.smtp_username,
                settings.smtp_password.get_secret_value() if settings.smtp_password else "",
            )
        smtp.send_message(message)


async def send_account_email(recipient: str, token: str, purpose: TokenPurpose) -> None:
    if not settings.smtp_enabled:
        logger.info("SMTP disabled; account email was not delivered")
        return
    verification = purpose == TokenPurpose.email_verification
    path = "/verify-email" if verification else "/reset-password"
    action = "Verify your email" if verification else "Reset your password"
    link = f"{settings.web_base_url.rstrip('/')}{path}?{urlencode({'token': token})}"
    message = EmailMessage()
    message["From"] = settings.email_from
    message["To"] = recipient
    message["Subject"] = f"BiletFlow — {action}"
    message.set_content(
        f"{action} for BiletFlow:\n\n{link}\n\n"
        "This link expires and can be used only once. "
        "If you did not request it, you can ignore this email.\n"
    )
    try:
        await asyncio.to_thread(_send, message)
    except (OSError, smtplib.SMTPException):
        # Never log raw verification/reset tokens or SMTP credentials. Accounts remain usable;
        # users can resend a link after delivery is restored.
        logger.error("Account email delivery failed; check SMTP and request a new link")
