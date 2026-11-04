import logging
import smtplib
import ssl

import pytest
from pydantic import SecretStr

from app.core.config import Settings, get_settings
from app.services import email_sender
from app.services.email_sender import send_email

SMTP_PASSWORD = "smtp-password-value"


class FakeSMTP:
    """Records the calls `_deliver` makes, in order."""

    def __init__(self) -> None:
        self.calls: list[str] = []
        self.context: ssl.SSLContext | None = None
        self.login_error: Exception | None = None
        self.sent = []

    def __call__(self, host: str, port: int, timeout: int) -> "FakeSMTP":
        return self

    def __enter__(self) -> "FakeSMTP":
        return self

    def __exit__(self, *_: object) -> None:
        return None

    def starttls(self, context: ssl.SSLContext | None = None) -> None:
        self.calls.append("starttls")
        self.context = context

    def login(self, username: str, password: str) -> None:
        self.calls.append("login")
        if self.login_error:
            raise self.login_error

    def send_message(self, message) -> None:
        self.calls.append("send")
        self.sent.append(message)


@pytest.fixture
def smtp(monkeypatch) -> FakeSMTP:
    fake = FakeSMTP()
    monkeypatch.setattr(email_sender.smtplib, "SMTP", fake)
    return fake


@pytest.fixture
def authenticated(monkeypatch) -> None:
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_starttls", True)
    monkeypatch.setattr(settings, "smtp_username", "sender@example.com")
    monkeypatch.setattr(settings, "smtp_password", SecretStr(SMTP_PASSWORD))


async def test_starttls_verifies_the_server_and_comes_before_the_login(smtp, authenticated):
    await send_email("to@example.com", "Subject", "Body")

    assert smtp.calls == ["starttls", "login", "send"]
    assert smtp.context.check_hostname is True
    assert smtp.context.verify_mode == ssl.CERT_REQUIRED


async def test_no_tls_or_login_without_credentials(smtp, monkeypatch):
    # Empty strings are what docker-compose passes when nothing is configured.
    settings = get_settings()
    monkeypatch.setattr(settings, "smtp_starttls", False)
    monkeypatch.setattr(settings, "smtp_username", "")
    monkeypatch.setattr(settings, "smtp_password", SecretStr(""))

    await send_email("to@example.com", "Subject", "Body")

    assert smtp.calls == ["send"]


async def test_the_message_has_the_configured_sender(smtp, monkeypatch):
    monkeypatch.setattr(get_settings(), "email_from", "tickets@example.com")

    await send_email("to@example.com", "Subject", "Body")

    message = smtp.sent[0]
    assert message["From"] == "tickets@example.com"
    assert message["To"] == "to@example.com"
    assert message["Subject"] == "Subject"


async def test_a_failed_delivery_is_logged_without_the_password(smtp, authenticated, caplog):
    smtp.login_error = smtplib.SMTPAuthenticationError(535, b"bad credentials")

    with caplog.at_level(logging.ERROR):
        await send_email("to@example.com", "Subject", "Body")

    assert "email delivery failed" in caplog.text
    assert SMTP_PASSWORD not in caplog.text


def _production_settings(**overrides) -> Settings:
    values = {
        "environment": "production",
        "jwt_secret": "a" * 32,
        "ticket_signing_secret": "b" * 32,
    }
    return Settings(**(values | overrides), _env_file=None)


def test_production_refuses_an_smtp_login_without_tls():
    with pytest.raises(ValueError, match="smtp_starttls"):
        _production_settings(smtp_username="sender@example.com", smtp_starttls=False)


def test_production_accepts_an_smtp_login_with_tls():
    _production_settings(smtp_username="sender@example.com", smtp_starttls=True)
