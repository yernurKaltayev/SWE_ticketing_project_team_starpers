import smtplib

from app.core.config import get_settings
from app.models import Notification
from app.models.notification import EmailStatus, NotificationType
from app.services import email_sender
from app.tasks.send_emails import send_pending_emails
from tests.factories import make_user


async def _pending(db, user, **overrides):
    row = Notification(
        user_id=user.id,
        type=NotificationType.event_update,
        title="Title",
        body="Body",
        payload={},
        **overrides,
    )
    db.add(row)
    await db.flush()
    return row


async def test_sends_pending_email_and_marks_it_sent(db, monkeypatch):
    sent = []

    async def fake_deliver(to, subject, body):
        sent.append((to, subject, body))

    monkeypatch.setattr(email_sender, "deliver_email", fake_deliver)
    user = await make_user(db)
    notification = await _pending(db, user)
    already_sent = await _pending(db, user, email_status=EmailStatus.sent)

    await send_pending_emails(db)

    assert (user.email, "Title", "Body") in sent
    assert all(subject == "Title" for _, subject, _ in sent)
    await db.refresh(notification)
    assert notification.email_status == EmailStatus.sent
    assert notification.email_attempts == 1
    await db.refresh(already_sent)
    assert already_sent.email_attempts == 0


async def test_failure_is_retried_then_marked_failed(db, monkeypatch):
    async def failing(to, subject, body):
        raise smtplib.SMTPServerDisconnected("down")

    monkeypatch.setattr(email_sender, "deliver_email", failing)
    user = await make_user(db)
    max_attempts = get_settings().notification_max_email_attempts
    notification = await _pending(db, user, email_attempts=max_attempts - 2)

    await send_pending_emails(db)
    await db.refresh(notification)
    assert notification.email_status == EmailStatus.pending
    assert notification.email_attempts == max_attempts - 1

    await send_pending_emails(db)
    await db.refresh(notification)
    assert notification.email_status == EmailStatus.failed
    assert notification.email_attempts == max_attempts
