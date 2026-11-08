"""Per-event paid-sales activation checklist [P6, SRS 3.2-3.3].

An event can sell paid tickets only once every step is done: at least one paid ticket type,
the (simulated) identity check, a verified payout account, the activation fee and the terms.
Activation applies to that one event. A platform admin can suspend it (P11 calls
`suspend_paid_sales`), which blocks new paid checkouts at once.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import exists, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.models.event import Event, EventStatus, PaidSalesStatus
from app.models.payment import (
    ActivationStatus,
    PaidSalesActivation,
    Payment,
    PaymentKind,
    PaymentStatus,
    PayoutAccount,
)
from app.models.ticket_type import TicketType
from app.models.user import OrganizerProfile, User, VerificationStatus
from app.schemas.payment import ActivationOut, ActivationUpdate, PaymentOut
from app.services.audit_service import audit
from app.services.payments.fees import activation_fee
from app.services.payments.payment_service import (
    _pending_payment,
    create_payment,
    to_payment_out,
)

STEP_PAID_TICKET_TYPE = "paid_ticket_type"
STEP_IDENTITY = "identity_verification"
STEP_PAYOUT_ACCOUNT = "payout_account"
STEP_ACTIVATION_FEE = "activation_fee"
STEP_TERMS = "terms"


async def get_or_create(db: AsyncSession, event: Event) -> PaidSalesActivation:
    # ON CONFLICT: two first visits to the checklist cannot create two rows.
    await db.execute(
        insert(PaidSalesActivation)
        .values(event_id=event.id)
        .on_conflict_do_nothing(index_elements=[PaidSalesActivation.event_id])
    )
    activation = await db.scalar(
        select(PaidSalesActivation)
        .where(PaidSalesActivation.event_id == event.id)
        .execution_options(populate_existing=True)
    )
    if activation is None:  # unreachable: the row was just upserted
        raise NotFoundError("Activation not found.", code="activation_not_found")
    return activation


async def _lock(db: AsyncSession, event: Event) -> PaidSalesActivation:
    await get_or_create(db, event)
    activation = await db.scalar(
        select(PaidSalesActivation)
        .where(PaidSalesActivation.event_id == event.id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
    if activation is None:  # unreachable: the row was just upserted
        raise NotFoundError("Activation not found.", code="activation_not_found")
    return activation


async def _fee_paid(db: AsyncSession, activation: PaidSalesActivation) -> bool:
    if activation.activation_payment_id is None:
        return False
    payment = await db.get(Payment, activation.activation_payment_id)
    return payment is not None and payment.status == PaymentStatus.succeeded


async def _payout_account_ok(db: AsyncSession, activation: PaidSalesActivation) -> bool:
    if activation.payout_account_id is None:
        return False
    account = await db.get(PayoutAccount, activation.payout_account_id)
    return account is not None and account.is_verified


async def missing_steps(
    db: AsyncSession, event: Event, activation: PaidSalesActivation
) -> list[str]:
    missing: list[str] = []
    has_paid_type = await db.scalar(
        select(exists().where(TicketType.event_id == event.id, TicketType.is_free.is_(False)))
    )
    if not has_paid_type:
        missing.append(STEP_PAID_TICKET_TYPE)
    if not activation.identity_verified:
        missing.append(STEP_IDENTITY)
    if not await _payout_account_ok(db, activation):
        missing.append(STEP_PAYOUT_ACCOUNT)
    if not await _fee_paid(db, activation):
        missing.append(STEP_ACTIVATION_FEE)
    if activation.terms_accepted_at is None:
        missing.append(STEP_TERMS)
    return missing


async def to_activation_out(
    db: AsyncSession, event: Event, activation: PaidSalesActivation
) -> ActivationOut:
    return ActivationOut(
        event_id=event.id,
        status=activation.status.value,  # type: ignore[arg-type]  # values match the Literal
        identity_verified=activation.identity_verified,
        payout_account_id=activation.payout_account_id,
        activation_fee_paid=await _fee_paid(db, activation),
        terms_accepted_at=activation.terms_accepted_at,
        missing_steps=await missing_steps(db, event, activation),
        is_simulated=True,
    )


async def try_activate(
    db: AsyncSession,
    event: Event,
    activation: PaidSalesActivation,
    now: datetime,
    actor: User | None = None,
) -> None:
    """Turn paid sales on once the checklist is complete. Never lifts a suspension."""
    if activation.status != ActivationStatus.incomplete:
        return
    if await missing_steps(db, event, activation):
        return
    activation.status = ActivationStatus.active
    activation.activated_at = now
    event.paid_sales_status = PaidSalesStatus.active
    audit(
        db,
        action_type="paid_sales.activated",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=actor,
        description="Paid sales activated (simulated checklist complete)",
    )


async def get_activation(db: AsyncSession, event: Event) -> ActivationOut:
    activation = await get_or_create(db, event)
    await db.commit()
    return await to_activation_out(db, event, activation)


async def update_activation(
    db: AsyncSession, user: User, event: Event, data: ActivationUpdate
) -> ActivationOut:
    now = datetime.now(UTC)
    activation = await _lock(db, event)
    if data.payout_account_id is not None:
        account = await db.get(PayoutAccount, data.payout_account_id)
        if account is None or account.organizer_id != event.organizer_id:
            raise NotFoundError("Payout account not found.", code="payout_account_not_found")
        if not account.is_verified:
            raise ConflictError(
                "The payout account is not verified.", code="payout_account_unverified"
            )
        activation.payout_account_id = account.id
    if data.accept_terms is not None:
        if not data.accept_terms:
            raise UnprocessableError(
                "Accepted terms cannot be withdrawn here.", code="terms_withdrawal_unsupported"
            )
        if activation.terms_accepted_at is None:
            activation.terms_accepted_at = now
    audit(
        db,
        action_type="paid_sales.updated",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Updated paid-sales activation checklist",
        metadata=data.model_dump(mode="json", exclude_none=True),
    )
    await try_activate(db, event, activation, now, user)
    await db.commit()
    return await to_activation_out(db, event, activation)


async def verify_identity(db: AsyncSession, user: User, event: Event) -> ActivationOut:
    """SIMULATED identity check: always passes. A real KYC provider would plug in here."""
    now = datetime.now(UTC)
    activation = await _lock(db, event)
    activation.identity_verified = True
    profile = await db.get(OrganizerProfile, event.organizer_id)
    if profile is not None and profile.verification_status != VerificationStatus.verified:
        profile.verification_status = VerificationStatus.verified
    audit(
        db,
        action_type="paid_sales.identity_verified",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=user,
        description="Simulated identity verification passed",
    )
    await try_activate(db, event, activation, now, user)
    await db.commit()
    return await to_activation_out(db, event, activation)


async def start_activation_payment(db: AsyncSession, user: User, event: Event) -> PaymentOut:
    if event.status == EventStatus.cancelled:
        raise ConflictError("The event is cancelled.", code="event_cancelled")
    activation = await _lock(db, event)
    if await _fee_paid(db, activation):
        raise ConflictError(
            "The activation fee is already paid.", code="activation_fee_already_paid"
        )
    existing = await _pending_payment(db, activation_id=activation.id)
    if existing is not None:
        return to_payment_out(existing)
    payment = await create_payment(
        db,
        kind=PaymentKind.activation_fee,
        amount=await activation_fee(db),
        reference=activation.id,
        activation_id=activation.id,
    )
    audit(
        db,
        action_type="payment.created",
        entity_type="payment",
        entity_id=payment.id,
        event_id=event.id,
        actor=user,
        description="Started simulated activation-fee payment",
        metadata={"amount_tiyn": payment.amount, "simulated": True},
    )
    await db.commit()
    return to_payment_out(payment)


async def settle_activation_fee(
    db: AsyncSession, payment: Payment, succeeded: bool, now: datetime
) -> uuid.UUID:
    """Webhook hook for an activation-fee payment. Returns the event ID. Does not commit."""
    activation = await db.scalar(
        select(PaidSalesActivation)
        .where(PaidSalesActivation.id == payment.activation_id)
        .with_for_update()
    )
    if activation is None:
        raise NotFoundError("Activation not found.", code="activation_not_found")
    if not succeeded:
        payment.status = PaymentStatus.failed
        return activation.event_id
    payment.status = PaymentStatus.succeeded
    activation.activation_payment_id = payment.id
    event = await db.get(Event, activation.event_id)
    if event is not None:
        await try_activate(db, event, activation, now)
    return activation.event_id


async def suspend_paid_sales(
    db: AsyncSession, event: Event, reason: str, actor: User | None = None
) -> PaidSalesActivation:
    """For P11: stop paid sales for one event. Does not commit."""
    activation = await _lock(db, event)
    activation.status = ActivationStatus.suspended
    activation.suspended_reason = reason
    event.paid_sales_status = PaidSalesStatus.suspended
    audit(
        db,
        action_type="paid_sales.suspended",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=actor,
        description="Paid sales suspended",
        metadata={"reason": reason},
    )
    return activation


async def resume_paid_sales(
    db: AsyncSession, event: Event, actor: User | None = None
) -> PaidSalesActivation:
    """For P11: lift a suspension. Re-runs the checklist instead of trusting old state."""
    activation = await _lock(db, event)
    if activation.status == ActivationStatus.suspended:
        activation.status = ActivationStatus.incomplete
        activation.suspended_reason = None
        event.paid_sales_status = PaidSalesStatus.disabled
        await try_activate(db, event, activation, datetime.now(UTC), actor)
    return activation
