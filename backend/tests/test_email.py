from email import policy
from email.parser import BytesParser
from urllib.parse import parse_qs, urlparse

from aiosmtpd.controller import Controller
from sqlalchemy import select

from app.core.config import settings
from app.core.security import hash_opaque_token
from app.models.token import VerificationToken


class Inbox:
    def __init__(self):
        self.messages = []

    async def handle_DATA(self, server, session, envelope):
        self.messages.append(BytesParser(policy=policy.default).parsebytes(envelope.content))
        return "250 OK"


def token_from(message):
    body = message.get_body(preferencelist=("plain",)).get_content()
    link = next(line.strip() for line in body.splitlines() if line.startswith("http"))
    return parse_qs(urlparse(link).query)["token"][0]


async def test_registration_and_reset_deliver_usable_email_links(
    client, session_factory, monkeypatch, unused_tcp_port, caplog
):
    inbox = Inbox()
    smtp = Controller(inbox, hostname="127.0.0.1", port=unused_tcp_port)
    smtp.start()
    monkeypatch.setattr(settings, "smtp_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "127.0.0.1")
    monkeypatch.setattr(settings, "smtp_port", unused_tcp_port)
    try:
        response = await client.post(
            "/api/v1/auth/register",
            json={
                "email": "emailtest@example.kz",
                "password": "initial-test-password",
                "full_name": "Email test",
            },
        )
        assert response.status_code == 201 and len(inbox.messages) == 1
        token = token_from(inbox.messages[-1])
        assert token not in caplog.text
        async with session_factory() as db:
            stored = await db.scalar(
                select(VerificationToken).where(
                    VerificationToken.token_hash == hash_opaque_token(token)
                )
            )
            assert stored is not None and stored.token_hash != token
        response = await client.post("/api/v1/auth/verify-email", json={"token": token})
        assert response.status_code == 200 and response.json()["is_email_verified"] is True
        assert (
            await client.post("/api/v1/auth/verify-email", json={"token": token})
        ).status_code == 400
        known = await client.post(
            "/api/v1/auth/password-reset/request", json={"email": "emailtest@example.kz"}
        )
        assert known.status_code == 200 and len(inbox.messages) == 2
        token = token_from(inbox.messages[-1])
        unknown = await client.post(
            "/api/v1/auth/password-reset/request", json={"email": "missing@example.kz"}
        )
        assert unknown.json() == known.json() and len(inbox.messages) == 2
        assert (
            await client.post(
                "/api/v1/auth/password-reset/confirm",
                json={"token": token, "new_password": "new-test-password"},
            )
        ).status_code == 200
        assert (
            await client.post(
                "/api/v1/auth/login",
                json={"email": "emailtest@example.kz", "password": "new-test-password"},
            )
        ).status_code == 200
        assert token not in caplog.text
    finally:
        smtp.stop()


async def test_smtp_failure_does_not_break_registration_or_leak_tokens(
    client, monkeypatch, unused_tcp_port, caplog
):
    monkeypatch.setattr(settings, "smtp_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "127.0.0.1")
    monkeypatch.setattr(settings, "smtp_port", unused_tcp_port)
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "email": "deliveryfailure@example.kz",
            "password": "initial-test-password",
            "full_name": "Delivery test",
        },
    )
    assert response.status_code == 201
    assert "delivery failed" in caplog.text
    assert "token for" not in caplog.text
