from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import OrmModel


class SuspendIn(BaseModel):
    """`suspended=true` suspends, `false` lifts it. A reason is always recorded in the audit log."""

    suspended: bool
    reason: str = Field(min_length=1, max_length=500)


class SettingsOut(BaseModel):
    settings: dict[str, Any]


class SettingsUpdate(BaseModel):
    settings: dict[str, Any] = Field(min_length=1)


class EventReportIn(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class EventReportOut(OrmModel):
    id: UUID
    event_id: UUID
    reporter_id: UUID
    reason: str
    status: str
    created_at: datetime | None = None


class EventReportUpdate(BaseModel):
    status: Literal["reviewed", "dismissed", "actioned"]


class AdminUserOut(OrmModel):
    id: UUID
    email: str
    full_name: str
    role: str
    is_suspended: bool
    email_verified_at: datetime | None
    last_login_at: datetime | None
    created_at: datetime


class AdminEventOut(OrmModel):
    id: UUID
    organizer_id: UUID
    title: str
    status: str
    paid_sales_status: str
    starts_at: datetime
    created_at: datetime


class AdminOrderOut(OrmModel):
    id: UUID
    order_number: str
    event_id: UUID
    buyer_user_id: UUID | None
    buyer_email: str
    status: str
    total: int
    currency: str
    is_simulated: bool
    created_at: datetime


class AdminPaymentOut(OrmModel):
    id: UUID
    order_id: UUID | None
    activation_id: UUID | None
    kind: str
    provider: str
    provider_ref: str
    status: str
    amount: int
    fee_amount: int
    currency: str
    is_simulated: bool
    failure_reason: str | None
    created_at: datetime


class AdminRefundOut(OrmModel):
    id: UUID
    order_id: UUID
    payment_id: UUID
    amount: int
    currency: str
    status: str
    reason: str
    initiated_by: UUID
    created_at: datetime


class AdminActivationOut(OrmModel):
    id: UUID
    event_id: UUID
    status: str
    identity_verified: bool
    payout_account_id: UUID | None
    activation_payment_id: UUID | None
    terms_accepted_at: datetime | None
    suspended_reason: str | None
    activated_at: datetime | None


class AdminSupportCaseOut(OrmModel):
    id: UUID
    requester_id: UUID
    audience: str
    category: str
    status: str
    assignee_id: UUID | None
    event_id: UUID | None
    order_id: UUID | None
    subject: str
    created_at: datetime


class PromoActivityOut(BaseModel):
    campaign_id: UUID
    event_id: UUID
    name: str
    is_enabled: bool
    max_redemptions: int
    redemptions_count: int
    applied_redemptions: int
    discount_total: int


class DisputesOut(BaseModel):
    """Derived queue: there is no dispute table, so disputes are failed refunds plus open
    support cases about payments or refunds."""

    failed_refunds: list[AdminRefundOut]
    payment_cases: list[AdminSupportCaseOut]
