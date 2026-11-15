"""/admin/* [P11 Yernur]. Every route requires the platform_admin role."""

import uuid
from datetime import datetime
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.core.deps import DbSession, require_role
from app.core.pagination import Page, Pagination, paginate
from app.models.event import Event, EventStatus
from app.models.order import OrderStatus
from app.models.payment import PaidSalesActivation, PaymentStatus
from app.models.refund import RefundStatus
from app.models.setting import EventReport, EventReportStatus
from app.models.support import SupportStatus
from app.models.user import User, UserRole
from app.schemas.admin import (
    AdminActivationOut,
    AdminEventOut,
    AdminOrderOut,
    AdminPaymentOut,
    AdminRefundOut,
    AdminSupportCaseOut,
    AdminUserOut,
    DisputesOut,
    EventReportOut,
    EventReportUpdate,
    PromoActivityOut,
    SettingsOut,
    SettingsUpdate,
    SuspendIn,
)
from app.services import admin_service

router = APIRouter(
    prefix="/admin",
    tags=["admin"],
    dependencies=[Depends(require_role(UserRole.platform_admin))],
)
Admin = Annotated[User, Depends(require_role(UserRole.platform_admin))]

Q = Query(None, max_length=200, description="Free-text search")
Start = Query(None, description="Created at or after (ISO 8601)")
End = Query(None, description="Created before (ISO 8601)")


@router.get("/users", response_model=Page[AdminUserOut])
async def search_users(
    db: DbSession,
    page: Pagination,
    q: str | None = Q,
    role: UserRole | None = None,
    suspended: bool | None = None,
    created_from: datetime | None = Start,
    created_to: datetime | None = End,
) -> Page[Any]:
    stmt = admin_service.users_stmt(q, role, suspended, created_from, created_to)
    return await paginate(db, stmt, page)


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
async def suspend_user(user_id: uuid.UUID, payload: SuspendIn, admin: Admin, db: DbSession) -> User:
    return await admin_service.set_user_suspension(
        db, admin, user_id, payload.suspended, payload.reason
    )


@router.get("/events", response_model=Page[AdminEventOut])
async def search_events(
    db: DbSession,
    page: Pagination,
    q: str | None = Q,
    status: EventStatus | None = None,
    created_from: datetime | None = Start,
    created_to: datetime | None = End,
) -> Page[Any]:
    stmt = admin_service.events_stmt(q, status, created_from, created_to)
    return await paginate(db, stmt, page)


@router.post("/events/{event_id}/suspend", response_model=AdminEventOut)
async def suspend_event(
    event_id: uuid.UUID, payload: SuspendIn, admin: Admin, db: DbSession
) -> Event:
    return await admin_service.set_event_suspension(
        db, admin, event_id, payload.suspended, payload.reason
    )


@router.post("/events/{event_id}/paid-sales/suspend", response_model=AdminActivationOut)
async def suspend_paid_sales(
    event_id: uuid.UUID, payload: SuspendIn, admin: Admin, db: DbSession
) -> PaidSalesActivation:
    return await admin_service.set_paid_sales_suspension(
        db, admin, event_id, payload.suspended, payload.reason
    )


@router.get("/orders", response_model=Page[AdminOrderOut])
async def search_orders(
    db: DbSession,
    page: Pagination,
    q: str | None = Q,
    status: OrderStatus | None = None,
    event_id: uuid.UUID | None = None,
    created_from: datetime | None = Start,
    created_to: datetime | None = End,
) -> Page[Any]:
    stmt = admin_service.orders_stmt(q, status, event_id, created_from, created_to)
    return await paginate(db, stmt, page)


@router.get("/payments", response_model=Page[AdminPaymentOut])
async def search_payments(
    db: DbSession,
    page: Pagination,
    q: str | None = Q,
    status: PaymentStatus | None = None,
    created_from: datetime | None = Start,
    created_to: datetime | None = End,
) -> Page[Any]:
    stmt = admin_service.payments_stmt(q, status, created_from, created_to)
    return await paginate(db, stmt, page)


@router.get("/activations", response_model=Page[AdminActivationOut])
async def list_activations(
    db: DbSession,
    page: Pagination,
    status: str | None = Query(None, pattern="^(incomplete|active|suspended)$"),
) -> Page[Any]:
    return await admin_service.list_activations(db, page, status)


@router.get("/refunds", response_model=Page[AdminRefundOut])
async def monitor_refunds(
    db: DbSession,
    page: Pagination,
    status: RefundStatus | None = None,
    created_from: datetime | None = Start,
    created_to: datetime | None = End,
) -> Page[Any]:
    return await paginate(db, admin_service.refunds_stmt(status, created_from, created_to), page)


@router.get("/disputes", response_model=DisputesOut)
async def monitor_disputes(db: DbSession, limit: int = Query(50, ge=1, le=100)) -> DisputesOut:
    refunds, cases = await admin_service.disputes(db, limit)
    return DisputesOut(
        failed_refunds=[AdminRefundOut.model_validate(r) for r in refunds],
        payment_cases=[AdminSupportCaseOut.model_validate(c) for c in cases],
    )


@router.get("/support/cases", response_model=Page[AdminSupportCaseOut])
async def escalated_cases(
    db: DbSession, page: Pagination, status: SupportStatus | None = None
) -> Page[Any]:
    return await paginate(db, admin_service.escalated_cases_stmt(status), page)


@router.get("/campaigns", response_model=Page[PromoActivityOut])
async def promo_activity(db: DbSession, page: Pagination) -> Page[PromoActivityOut]:
    return await admin_service.promo_activity(db, page)


@router.get("/reports", response_model=Page[EventReportOut])
async def list_event_reports(
    db: DbSession, page: Pagination, status: EventReportStatus | None = None
) -> Page[Any]:
    return await paginate(db, admin_service.event_reports_stmt(status), page)


@router.patch("/reports/{report_id}", response_model=EventReportOut)
async def review_event_report(
    report_id: uuid.UUID, payload: EventReportUpdate, admin: Admin, db: DbSession
) -> EventReport:
    return await admin_service.review_event_report(
        db, admin, report_id, EventReportStatus(payload.status)
    )


@router.get("/settings", response_model=SettingsOut)
async def get_settings_(db: DbSession) -> SettingsOut:
    return SettingsOut(settings=await admin_service.effective_settings(db))


@router.patch("/settings", response_model=SettingsOut)
async def update_settings(payload: SettingsUpdate, admin: Admin, db: DbSession) -> SettingsOut:
    return SettingsOut(settings=await admin_service.update_settings(db, admin, payload.settings))


@router.get("/exports/{report}.csv")
async def export_report(
    report: str,
    db: DbSession,
    created_from: datetime | None = Start,
    created_to: datetime | None = End,
) -> StreamingResponse:
    rows = await admin_service.csv_report(db, report, created_from, created_to)
    return StreamingResponse(
        rows,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{report}.csv"'},
    )
