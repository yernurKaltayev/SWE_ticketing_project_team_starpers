"""/payments, webhooks, activation, payouts [P6 Dima]

Every payment, verification and payout here is SIMULATED (`is_simulated: true`).
"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request, Response, status

from app.core.deps import CurrentUser, DbSession, require_event_access, require_role
from app.core.pagination import Page, Pagination
from app.models.event import Event
from app.models.user import StaffRole, User, UserRole
from app.schemas.payment import (
    ActivationOut,
    ActivationUpdate,
    FinancialSummaryOut,
    PaymentOut,
    PayoutAccountIn,
    PayoutAccountOut,
    PayoutOut,
    SimulatePaymentIn,
)
from app.services.payments import activation as activation_service
from app.services.payments import payment_service
from app.services.payments import payout as payout_service
from app.services.payments.sandbox import SIGNATURE_HEADER

router = APIRouter(tags=["payments"])

Organizer = Annotated[User, Depends(require_role(UserRole.organizer))]
ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]


@router.post(
    "/orders/{order_id}/payments", response_model=PaymentOut, status_code=status.HTTP_201_CREATED
)
async def start_payment(order_id: uuid.UUID, user: CurrentUser, db: DbSession) -> PaymentOut:
    return await payment_service.start_order_payment(db, user, order_id)


@router.get("/payments/{payment_id}", response_model=PaymentOut)
async def get_payment(payment_id: uuid.UUID, user: CurrentUser, db: DbSession) -> PaymentOut:
    return await payment_service.get_payment(db, user, payment_id)


@router.post("/payments/{payment_id}/simulate", response_model=PaymentOut)
async def simulate_payment(
    payment_id: uuid.UUID, data: SimulatePaymentIn, user: CurrentUser, db: DbSession
) -> PaymentOut:
    return await payment_service.simulate_payment(
        db,
        user,
        payment_id,
        succeed=data.outcome == "succeeded",
        failure_reason=data.failure_reason,
    )


@router.post(
    "/payments/webhooks/{provider}",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
async def payment_webhook(
    provider: str,
    request: Request,
    db: DbSession,
    signature: Annotated[str, Header(alias=SIGNATURE_HEADER)] = "",
) -> Response:
    try:
        await payment_service.process_provider_event(db, provider, await request.body(), signature)
    except Exception:
        await db.rollback()
        raise
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/events/{event_id}/activation", response_model=ActivationOut)
async def get_activation(event: ManagedEvent, db: DbSession) -> ActivationOut:
    return await activation_service.get_activation(db, event)


@router.patch("/events/{event_id}/activation", response_model=ActivationOut)
async def update_activation(
    data: ActivationUpdate, event: ManagedEvent, user: CurrentUser, db: DbSession
) -> ActivationOut:
    return await activation_service.update_activation(db, user, event, data)


@router.post("/events/{event_id}/activation/verify-identity", response_model=ActivationOut)
async def verify_identity(event: ManagedEvent, user: CurrentUser, db: DbSession) -> ActivationOut:
    return await activation_service.verify_identity(db, user, event)


@router.post(
    "/events/{event_id}/activation/pay",
    response_model=PaymentOut,
    status_code=status.HTTP_201_CREATED,
)
async def pay_activation_fee(event: ManagedEvent, user: CurrentUser, db: DbSession) -> PaymentOut:
    return await activation_service.start_activation_payment(db, user, event)


@router.get("/events/{event_id}/financials", response_model=FinancialSummaryOut)
async def financials(event: ManagedEvent, db: DbSession) -> FinancialSummaryOut:
    return await payout_service.financial_summary(db, event)


@router.get("/organizers/me/payout-accounts", response_model=list[PayoutAccountOut])
async def list_payout_accounts(user: Organizer, db: DbSession) -> list[PayoutAccountOut]:
    return await payout_service.list_accounts(db, user)


@router.post(
    "/organizers/me/payout-accounts",
    response_model=PayoutAccountOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_payout_account(
    data: PayoutAccountIn, user: Organizer, db: DbSession
) -> PayoutAccountOut:
    return await payout_service.create_account(db, user, data)


@router.patch("/organizers/me/payout-accounts/{account_id}", response_model=PayoutAccountOut)
async def update_payout_account(
    account_id: uuid.UUID, data: PayoutAccountIn, user: Organizer, db: DbSession
) -> PayoutAccountOut:
    return await payout_service.update_account(db, user, account_id, data)


@router.delete(
    "/organizers/me/payout-accounts/{account_id}", status_code=status.HTTP_204_NO_CONTENT
)
async def delete_payout_account(account_id: uuid.UUID, user: Organizer, db: DbSession) -> None:
    await payout_service.delete_account(db, user, account_id)


@router.get("/organizers/me/payouts", response_model=Page[PayoutOut])
async def list_payouts(user: Organizer, db: DbSession, params: Pagination) -> Page[PayoutOut]:
    return await payout_service.list_payouts(db, user, params)
