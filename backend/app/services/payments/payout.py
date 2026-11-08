"""Payout accounts, financial summaries and the simulated payout schedule [P6, SRS 4.6].

IBANs are encrypted at rest and only the last four characters ever leave the API. Payouts are
simulated: the job marks them paid on schedule, nothing is transferred.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import exists, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.crypto import decrypt_field, encrypt_field
from app.core.errors import ConflictError, NotFoundError
from app.core.pagination import Page, PageParams, paginate
from app.models.event import Event, EventStatus
from app.models.notification import NotificationType
from app.models.order import Order
from app.models.payment import (
    PaidSalesActivation,
    Payment,
    PaymentKind,
    PaymentStatus,
    Payout,
    PayoutAccount,
    PayoutStatus,
)
from app.models.refund import Refund, RefundStatus
from app.models.user import OrganizerProfile, User
from app.schemas.payment import (
    FinancialSummaryOut,
    PayoutAccountIn,
    PayoutAccountOut,
    PayoutOut,
)
from app.services.audit_service import audit
from app.services.notification_service import notify
from app.services.payments.fees import payout_delay_days
from app.services.user_service import get_organizer_profile


def to_account_out(account: PayoutAccount) -> PayoutAccountOut:
    try:
        last4 = decrypt_field(account.iban_encrypted)[-4:]
    except ValueError:
        last4 = "????"
    return PayoutAccountOut(
        id=account.id,
        bank_name=account.bank_name,
        iban_last4=last4,
        holder_name=account.holder_name,
        is_verified=account.is_verified,
        is_simulated=account.is_simulated,
    )


async def list_accounts(db: AsyncSession, user: User) -> list[PayoutAccountOut]:
    profile = await get_organizer_profile(db, user)
    rows = await db.scalars(
        select(PayoutAccount)
        .where(PayoutAccount.organizer_id == profile.id)
        .order_by(PayoutAccount.created_at, PayoutAccount.id)
    )
    return [to_account_out(account) for account in rows]


async def create_account(db: AsyncSession, user: User, data: PayoutAccountIn) -> PayoutAccountOut:
    profile = await get_organizer_profile(db, user)
    account = PayoutAccount(
        organizer_id=profile.id,
        bank_name=data.bank_name,
        iban_encrypted=encrypt_field(data.iban),
        holder_name=data.holder_name,
        # SIMULATED verification: the IBAN passed its checksum in the schema.
        is_verified=True,
        is_simulated=True,
    )
    db.add(account)
    await db.flush()
    audit(
        db,
        action_type="payout_account.created",
        entity_type="payout_account",
        entity_id=account.id,
        actor=user,
        description="Added simulated payout account",
    )
    await db.commit()
    return to_account_out(account)


async def _own_account(db: AsyncSession, user: User, account_id: uuid.UUID) -> PayoutAccount:
    profile = await get_organizer_profile(db, user)
    account = await db.scalar(
        select(PayoutAccount).where(PayoutAccount.id == account_id).with_for_update()
    )
    # 404 rather than 403: another organizer's account IDs are not disclosed.
    if account is None or account.organizer_id != profile.id:
        raise NotFoundError("Payout account not found.", code="payout_account_not_found")
    return account


async def update_account(
    db: AsyncSession, user: User, account_id: uuid.UUID, data: PayoutAccountIn
) -> PayoutAccountOut:
    account = await _own_account(db, user, account_id)
    account.bank_name = data.bank_name
    account.iban_encrypted = encrypt_field(data.iban)
    account.holder_name = data.holder_name
    account.is_verified = True
    audit(
        db,
        action_type="payout_account.updated",
        entity_type="payout_account",
        entity_id=account.id,
        actor=user,
        description="Updated simulated payout account",
    )
    await db.commit()
    return to_account_out(account)


async def delete_account(db: AsyncSession, user: User, account_id: uuid.UUID) -> None:
    account = await _own_account(db, user, account_id)
    in_use = await db.scalar(
        select(exists().where(PaidSalesActivation.payout_account_id == account.id))
    )
    if in_use:
        raise ConflictError(
            "This account is linked to an event's paid sales.", code="payout_account_in_use"
        )
    audit(
        db,
        action_type="payout_account.deleted",
        entity_type="payout_account",
        entity_id=account.id,
        actor=user,
        description="Removed simulated payout account",
    )
    await db.delete(account)
    await db.commit()


async def list_payouts(db: AsyncSession, user: User, params: PageParams) -> Page[PayoutOut]:
    profile = await get_organizer_profile(db, user)
    page = await paginate(
        db,
        select(Payout)
        .where(Payout.organizer_id == profile.id)
        .order_by(Payout.created_at.desc(), Payout.id.desc()),
        params,
    )
    return Page[PayoutOut](
        items=[PayoutOut.model_validate(row, from_attributes=True) for row in page.items],
        total=page.total,
        limit=page.limit,
        offset=page.offset,
    )


async def _totals(db: AsyncSession, event_id: uuid.UUID) -> tuple[int, int, int]:
    gross, fees = (
        await db.execute(
            select(
                func.coalesce(func.sum(Payment.amount), 0),
                func.coalesce(func.sum(Payment.fee_amount), 0),
            )
            .join(Order, Order.id == Payment.order_id)
            .where(
                Order.event_id == event_id,
                Payment.kind == PaymentKind.ticket,
                Payment.status == PaymentStatus.succeeded,
            )
        )
    ).one()
    refunds = await db.scalar(
        select(func.coalesce(func.sum(Refund.amount), 0))
        .join(Order, Order.id == Refund.order_id)
        .where(Order.event_id == event_id, Refund.status == RefundStatus.completed)
    )
    return int(gross), int(fees), int(refunds or 0)


async def financial_summary(db: AsyncSession, event: Event) -> FinancialSummaryOut:
    gross, fees, refunds = await _totals(db, event.id)
    return FinancialSummaryOut(
        gross=gross,
        fees=fees,
        refunds=refunds,
        estimated_payout=max(gross - fees - refunds, 0),
        currency="KZT",
        is_simulated=True,
    )


async def run_payout_schedule(db: AsyncSession, now: datetime | None = None) -> int:
    """Idempotent job step: schedule payouts for finished events, then "pay" due ones.

    Returns how many payouts changed. Commits.
    """
    now = now or datetime.now(UTC)
    changed = 0
    delay = timedelta(days=await payout_delay_days(db))

    has_sales = exists().where(
        Payment.order_id == Order.id,
        Order.event_id == Event.id,
        Payment.kind == PaymentKind.ticket,
        Payment.status == PaymentStatus.succeeded,
    )
    has_payout = exists().where(Payout.event_id == Event.id)
    finished = await db.scalars(
        select(Event)
        .where(
            Event.ends_at <= now,
            Event.status != EventStatus.cancelled,
            has_sales,
            ~has_payout,
        )
        .order_by(Event.ends_at, Event.id)
        .limit(200)
    )
    for event in list(finished):
        gross, fees, refunds = await _totals(db, event.id)
        db.add(
            Payout(
                organizer_id=event.organizer_id,
                event_id=event.id,
                gross=gross,
                fees=fees,
                refunds=refunds,
                net=max(gross - fees - refunds, 0),
                currency="KZT",
                status=PayoutStatus.scheduled,
                scheduled_for=event.ends_at + delay,
            )
        )
        changed += 1
    await db.flush()

    due = await db.scalars(
        select(Payout)
        .where(Payout.status == PayoutStatus.scheduled, Payout.scheduled_for <= now)
        .order_by(Payout.scheduled_for, Payout.id)
        .with_for_update(skip_locked=True)
        .limit(200)
    )
    for payout in list(due):
        payout.status = PayoutStatus.paid
        payout.paid_at = now
        changed += 1
        audit(
            db,
            action_type="payout.paid",
            entity_type="payout",
            entity_id=payout.id,
            event_id=payout.event_id,
            description="Simulated payout marked paid",
            metadata={"net_tiyn": payout.net, "simulated": True},
        )
        owner = await db.scalar(
            select(User)
            .join(OrganizerProfile, OrganizerProfile.user_id == User.id)
            .where(OrganizerProfile.id == payout.organizer_id)
        )
        if owner is not None:
            await notify(
                db,
                NotificationType.payout_status,
                owner,
                {"payout_id": str(payout.id), "status": payout.status.value},
            )
    await db.commit()
    return changed
