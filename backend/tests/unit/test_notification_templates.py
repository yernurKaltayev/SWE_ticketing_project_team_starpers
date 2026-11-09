import uuid

import pytest

from app.models.notification import NotificationType
from app.models.payment import Payment, PaymentKind, PaymentProviderName
from app.models.refund import Refund
from app.services.notification_templates import TEMPLATES, render
from tests.factories import make_event, make_order, make_user


def test_every_notification_type_has_a_template():
    assert set(TEMPLATES) == set(NotificationType)


@pytest.mark.parametrize("event_type", list(NotificationType))
async def test_every_template_renders_without_context(db, event_type):
    user = await make_user(db)

    title, body = await render(db, event_type, user, {})

    assert title.strip()
    assert body.strip()


async def test_unknown_ids_fall_back_to_generic_text(db):
    user = await make_user(db)

    title, body = await render(
        db,
        NotificationType.refund_completed,
        user,
        {"order_id": "not-a-uuid", "refund_id": str(uuid.uuid4())},
    )

    assert title == "Refund completed"
    assert "your order" in body


async def test_refund_shows_the_amount_and_order_number(db):
    user = await make_user(db)
    event = await make_event(db, title="Rock Fest")
    order = await make_order(db, event, buyer_user_id=user.id)
    payment = Payment(
        order_id=order.id,
        kind=PaymentKind.ticket,
        provider=PaymentProviderName.sandbox,
        provider_ref=f"ref-{uuid.uuid4().hex}",
        amount=1_500_000,
    )
    db.add(payment)
    await db.flush()
    refund = Refund(
        order_id=order.id,
        payment_id=payment.id,
        amount=1_500_000,
        reason="test",
        initiated_by=user.id,
    )
    db.add(refund)
    await db.flush()

    _, body = await render(
        db,
        NotificationType.refund_completed,
        user,
        {"order_id": str(order.id), "refund_id": str(refund.id)},
    )

    assert "15,000.00 KZT" in body
    assert order.order_number in body
    assert '"Rock Fest"' in body
    assert "simulated" in body
