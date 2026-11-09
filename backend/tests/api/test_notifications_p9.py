"""P9: notify(), /me/notifications and the hooks other parts already call."""

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.models import Notification
from app.models.event import EventStatus, EventVisibility
from app.models.notification import EmailStatus, NotificationType
from app.services import notification_service
from app.services.notification_service import notify
from tests.factories import auth_header, make_event, make_order, make_ticket_type, make_user

PREFIX = "/api/v1"


async def test_notify_stores_a_pending_notification(db):
    user = await make_user(db, full_name="Aigerim")
    event = await make_event(db, title="Jazz Night")
    order = await make_order(db, event, buyer_user_id=user.id, total=250_000)

    notification = await notify(
        db, NotificationType.purchase_confirmation, user, {"order_id": str(order.id)}
    )

    assert notification is not None
    stored = await db.get(Notification, notification.id)
    assert stored.email_status == EmailStatus.pending
    assert stored.email_attempts == 0
    assert stored.payload == {"order_id": str(order.id)}
    assert "Jazz Night" in stored.title
    assert order.order_number in stored.body
    assert "2,500.00 KZT" in stored.body
    assert stored.body.startswith("Hello Aigerim")


async def test_notify_never_raises_into_the_caller(db, monkeypatch):
    user = await make_user(db)

    async def broken(*args, **kwargs):
        raise RuntimeError("template bug")

    monkeypatch.setattr(notification_service, "render", broken)

    assert await notify(db, NotificationType.event_update, user, {}) is None
    # The caller's transaction is still usable.
    assert await db.scalar(select(Notification).where(Notification.user_id == user.id)) is None
    await make_user(db)


async def _notification(db, user, title="Hello", **overrides):
    row = Notification(
        user_id=user.id,
        type=NotificationType.event_update,
        title=title,
        body="Body",
        payload={},
        **overrides,
    )
    db.add(row)
    await db.flush()
    return row


async def test_list_is_newest_first_and_paginated(client, db):
    user = await make_user(db)
    now = datetime.now(UTC)
    old = await _notification(db, user, title="old", created_at=now - timedelta(hours=1))
    new = await _notification(db, user, title="new", created_at=now)
    await _notification(db, await make_user(db), title="someone else's")

    page1 = await client.get(f"{PREFIX}/me/notifications?limit=1", headers=auth_header(user))
    page2 = await client.get(
        f"{PREFIX}/me/notifications?limit=1&offset=1", headers=auth_header(user)
    )

    assert page1.status_code == 200
    assert page1.json()["total"] == 2
    assert [item["id"] for item in page1.json()["items"]] == [str(new.id)]
    assert [item["id"] for item in page2.json()["items"]] == [str(old.id)]


async def test_unread_only_and_mark_read(client, db):
    user = await make_user(db)
    unread = await _notification(db, user, title="unread")
    read = await _notification(db, user, title="read")

    response = await client.post(
        f"{PREFIX}/me/notifications/{read.id}/read", headers=auth_header(user)
    )
    assert response.status_code == 200
    first_read_at = response.json()["read_at"]
    assert first_read_at is not None

    again = await client.post(
        f"{PREFIX}/me/notifications/{read.id}/read", headers=auth_header(user)
    )
    assert again.status_code == 200
    assert again.json()["read_at"] == first_read_at

    listed = await client.get(
        f"{PREFIX}/me/notifications?unread_only=true", headers=auth_header(user)
    )
    assert [item["id"] for item in listed.json()["items"]] == [str(unread.id)]


async def test_cannot_read_another_users_notification(client, db):
    owner = await make_user(db)
    stranger = await make_user(db)
    notification = await _notification(db, owner)

    response = await client.post(
        f"{PREFIX}/me/notifications/{notification.id}/read", headers=auth_header(stranger)
    )

    assert response.status_code == 404
    assert response.json()["code"] == "notification_not_found"
    await db.refresh(notification)
    assert notification.read_at is None


async def test_unknown_notification_is_404(client, db):
    user = await make_user(db)
    response = await client.post(
        f"{PREFIX}/me/notifications/{uuid.uuid4()}/read", headers=auth_header(user)
    )
    assert response.status_code == 404


async def test_requires_authentication(client):
    assert (await client.get(f"{PREFIX}/me/notifications")).status_code == 401
    response = await client.post(f"{PREFIX}/me/notifications/{uuid.uuid4()}/read")
    assert response.status_code == 401


async def test_free_registration_notifies_the_buyer(client, db):
    buyer = await make_user(db)
    event = await make_event(
        db, status=EventStatus.published, visibility=EventVisibility.public, title="Free Talk"
    )
    ticket_type = await make_ticket_type(
        db, event, is_free=True, price_amount=0, quantity_total=5, max_per_order=5
    )
    payload = {
        "event_id": str(event.id),
        "items": [{"ticket_type_id": str(ticket_type.id), "quantity": 1}],
        "attendees": [{"full_name": "Guest", "email": "guest@example.com"}],
    }

    response = await client.post(f"{PREFIX}/orders", json=payload, headers=auth_header(buyer))

    assert response.status_code == 201, response.text
    types = set(await db.scalars(select(Notification.type).where(Notification.user_id == buyer.id)))
    assert types == {NotificationType.purchase_confirmation, NotificationType.ticket_delivery}
