"""P6 payment lifecycle: create intent -> verified webhook -> paid order + tickets, or failure.

Everything here is a simulation (`is_simulated=True`); no card data is accepted or stored.
Webhooks are idempotent per (provider, provider_ref): the payment row is locked and only a
`pending` payment is ever transitioned, so a repeated callback changes nothing.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.deps import check_event_access
from app.core.errors import (
    AppError,
    ConflictError,
    ForbiddenError,
    NotFoundError,
    UnprocessableError,
)
from app.core.money import Money
from app.models.event import Event, PaidSalesStatus
from app.models.notification import NotificationType
from app.models.order import Order, OrderStatus
from app.models.payment import (
    PaidSalesActivation,
    Payment,
    PaymentKind,
    PaymentProviderName,
    PaymentStatus,
)
from app.models.user import StaffRole, User
from app.schemas.payment import PaymentOut
from app.services import order_service
from app.services.audit_service import audit
from app.services.inventory_service import release_inventory
from app.services.notification_service import notify
from app.services.payments import DEFAULT_PROVIDER, get_provider
from app.services.payments.fees import processing_fee
from app.services.payments.sandbox import InvalidWebhookError, SandboxProvider, checkout_url_for

VOIDED_REASON = "order_no_longer_payable_voided"


def to_payment_out(payment: Payment) -> PaymentOut:
    pending = payment.status == PaymentStatus.pending
    return PaymentOut(
        id=payment.id,
        kind=payment.kind.value,  # type: ignore[arg-type]  # enum values match the Literal
        status=payment.status.value,
        amount=payment.amount,
        fee_amount=payment.fee_amount,
        currency=payment.currency,
        is_simulated=payment.is_simulated,
        checkout_url=checkout_url_for(payment.provider_ref)
        if pending and payment.provider == PaymentProviderName.sandbox
        else None,
        failure_reason=payment.failure_reason,
    )


async def _pending_payment(
    db: AsyncSession, *, order_id: uuid.UUID | None = None, activation_id: uuid.UUID | None = None
) -> Payment | None:
    stmt = select(Payment).where(Payment.status == PaymentStatus.pending)
    if order_id is not None:
        stmt = stmt.where(Payment.order_id == order_id)
    if activation_id is not None:
        stmt = stmt.where(Payment.activation_id == activation_id)
    return await db.scalar(stmt.order_by(Payment.created_at.desc()).limit(1))


async def create_payment(
    db: AsyncSession,
    *,
    kind: PaymentKind,
    amount: Money,
    reference: uuid.UUID,
    order_id: uuid.UUID | None = None,
    activation_id: uuid.UUID | None = None,
    fee: Money | None = None,
) -> Payment:
    """Open a provider intent and persist the pending payment. Does not commit."""
    provider = get_provider(DEFAULT_PROVIDER)
    intent = await provider.create_intent(amount, reference=str(reference))
    payment = Payment(
        order_id=order_id,
        activation_id=activation_id,
        kind=kind,
        provider=provider.name,
        provider_ref=intent.provider_ref,
        status=PaymentStatus.pending,
        amount=amount.amount,
        fee_amount=(fee or Money.zero(amount.currency)).amount,
        currency=amount.currency,
        is_simulated=intent.is_simulated,
    )
    db.add(payment)
    await db.flush()
    return payment


async def start_order_payment(
    db: AsyncSession, user: User, order_id: uuid.UUID, now: datetime | None = None
) -> PaymentOut:
    """Start (or resume) the simulated payment for a pending paid order."""
    now = now or datetime.now(UTC)
    order = await db.scalar(
        select(Order)
        .where(Order.id == order_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if order is None:
        raise NotFoundError("Order not found.", code="order_not_found")
    if order.buyer_user_id != user.id:
        raise ForbiddenError("Only the buyer can pay for this order.", code="order_access_denied")
    if order.status == OrderStatus.paid:
        raise ConflictError("This order is already paid.", code="order_already_paid")
    if order.status != OrderStatus.pending:
        raise ConflictError("Order is not awaiting payment.", code="order_not_pending")
    if order.total <= 0:
        raise ConflictError("This order has nothing to pay.", code="order_not_payable")
    if order.expires_at is not None and order.expires_at <= now:
        raise ConflictError("Checkout reservation has expired.", code="order_expired")

    # Retrying the same checkout resumes its open intent instead of opening a second one.
    existing = await _pending_payment(db, order_id=order.id)
    if existing is not None:
        return to_payment_out(existing)

    event = await db.get(Event, order.event_id)
    if event is None or event.paid_sales_status != PaidSalesStatus.active:
        raise ConflictError("Paid sales are not active.", code="paid_sales_inactive")

    amount = Money(order.total, order.currency)
    payment = await create_payment(
        db,
        kind=PaymentKind.ticket,
        amount=amount,
        reference=order.id,
        order_id=order.id,
        fee=await processing_fee(db, amount),
    )
    audit(
        db,
        action_type="payment.created",
        entity_type="payment",
        entity_id=payment.id,
        event_id=order.event_id,
        actor=user,
        description="Started simulated ticket payment",
        metadata={"order_id": str(order.id), "amount_tiyn": payment.amount, "simulated": True},
    )
    await db.commit()
    return to_payment_out(payment)


async def _authorize_payment(db: AsyncSession, user: User, payment: Payment) -> None:
    if payment.kind == PaymentKind.ticket and payment.order_id is not None:
        order = await db.get(Order, payment.order_id)
        if order is None:
            raise NotFoundError("Payment not found.", code="payment_not_found")
        if order.buyer_user_id != user.id:
            await check_event_access(db, user, order.event_id, StaffRole.support)
        return
    activation = (
        await db.get(PaidSalesActivation, payment.activation_id) if payment.activation_id else None
    )
    if activation is None:
        raise NotFoundError("Payment not found.", code="payment_not_found")
    await check_event_access(db, user, activation.event_id, StaffRole.manager)


async def get_payment(db: AsyncSession, user: User, payment_id: uuid.UUID) -> PaymentOut:
    payment = await db.get(Payment, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.", code="payment_not_found")
    await _authorize_payment(db, user, payment)
    return to_payment_out(payment)


async def _settle_ticket_payment(
    db: AsyncSession, payment: Payment, succeeded: bool, now: datetime
) -> None:
    if payment.order_id is None:  # excluded by the kind_has_target constraint
        raise NotFoundError("Order not found.", code="order_not_found")
    order_id = payment.order_id
    if not succeeded:
        payment.status = PaymentStatus.failed
        order = await db.get(Order, order_id)
        if order is not None and order.status == OrderStatus.pending:
            await order_service.fail_pending_order(db, order_id)
        if order is not None and order.buyer_user_id is not None:
            buyer = await db.get(User, order.buyer_user_id)
            if buyer is not None:
                await notify(
                    db,
                    NotificationType.payment_failed,
                    buyer,
                    {"order_id": str(order_id), "payment_id": str(payment.id)},
                )
        return

    try:
        # Savepoint: a refused confirmation must not leave half-applied inventory changes.
        async with db.begin_nested():
            await order_service.confirm_paid_order(db, order_id, now)
        payment.status = PaymentStatus.succeeded
    except (ConflictError, NotFoundError):
        # Money arrived for an order that can no longer be fulfilled (expired, cancelled...):
        # void it at the provider rather than issue tickets.
        refund = await get_provider(payment.provider).refund(
            payment.provider_ref, Money(payment.amount, payment.currency)
        )
        payment.status = PaymentStatus.cancelled
        payment.failure_reason = (
            VOIDED_REASON if refund.succeeded else f"void_failed:{refund.failure_reason}"
        )
        order = await db.get(Order, order_id)
        if order is not None and order.status == OrderStatus.pending:
            await release_inventory(db, order, terminal_status=OrderStatus.expired)


async def process_provider_event(
    db: AsyncSession,
    provider_name: str,
    payload: bytes,
    signature: str,
    now: datetime | None = None,
) -> Payment:
    """Verify, then apply a provider webhook exactly once. Commits."""
    now = now or datetime.now(UTC)
    provider = get_provider(provider_name)
    try:
        event = provider.parse_webhook(payload, signature)
    except InvalidWebhookError as exc:
        raise UnprocessableError(
            "The webhook signature or body is invalid.", code="invalid_webhook"
        ) from exc

    payment = await db.scalar(
        select(Payment)
        .where(Payment.provider == provider.name, Payment.provider_ref == event.provider_ref)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if payment is None:
        raise NotFoundError("Payment not found.", code="payment_not_found")
    if payment.status != PaymentStatus.pending:
        return payment  # duplicate delivery: already applied

    payment.raw_event = event.raw
    succeeded = event.status == PaymentStatus.succeeded
    if not succeeded:
        payment.failure_reason = event.failure_reason or "declined"

    event_id: uuid.UUID | None = None
    if payment.kind == PaymentKind.ticket:
        await _settle_ticket_payment(db, payment, succeeded, now)
        order = await db.get(Order, payment.order_id) if payment.order_id else None
        event_id = order.event_id if order else None
    else:
        # Imported here: activation imports this module to open the fee payment.
        from app.services.payments import activation as activation_service

        event_id = await activation_service.settle_activation_fee(db, payment, succeeded, now)

    audit(
        db,
        action_type=f"payment.{payment.status.value}",
        entity_type="payment",
        entity_id=payment.id,
        event_id=event_id,
        description=f"Simulated {payment.kind.value} payment {payment.status.value}",
        metadata={
            "provider_ref": payment.provider_ref,
            "amount_tiyn": payment.amount,
            "failure_reason": payment.failure_reason,
            "simulated": payment.is_simulated,
        },
    )
    await db.commit()
    return payment


async def simulate_payment(
    db: AsyncSession,
    user: User,
    payment_id: uuid.UUID,
    *,
    succeed: bool,
    failure_reason: str | None = None,
) -> PaymentOut:
    """Sandbox control: make the provider "send" its signed webhook for this payment."""
    if not get_settings().payment_simulation_enabled:
        raise ForbiddenError("Payment simulation is disabled.", code="simulation_disabled")
    payment = await db.get(Payment, payment_id)
    if payment is None:
        raise NotFoundError("Payment not found.", code="payment_not_found")
    if payment.provider != PaymentProviderName.sandbox:
        raise ConflictError("Only sandbox payments can be simulated.", code="not_simulated")
    if payment.kind == PaymentKind.ticket:
        order = await db.get(Order, payment.order_id) if payment.order_id else None
        if order is None or order.buyer_user_id != user.id:
            raise ForbiddenError("Only the buyer can complete this payment.", code="forbidden")
    else:
        await _authorize_payment(db, user, payment)
    if payment.status != PaymentStatus.pending:
        return to_payment_out(payment)

    body, signature = SandboxProvider.build_webhook(
        payment.provider_ref,
        PaymentStatus.succeeded if succeed else PaymentStatus.failed,
        None if succeed else (failure_reason or "declined"),
    )
    try:
        settled = await process_provider_event(db, payment.provider.value, body, signature)
    except AppError:
        await db.rollback()
        raise
    return to_payment_out(settled)
