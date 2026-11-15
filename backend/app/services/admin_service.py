"""Platform administration [P11, SRS 4.12]: search, suspension, settings, monitors, CSV.

Every function assumes the router already checked `platform_admin`. State changes add an audit
entry to the caller's transaction and commit once at the end.
"""

import csv
import io
import uuid
from collections.abc import Iterator
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from typing import Any

from sqlalchemy import Select, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ConflictError, NotFoundError, UnprocessableError
from app.core.pagination import Page, PageParams, paginate
from app.models.event import Event, EventStatus, EventVisibility, PaidSalesStatus
from app.models.notification import NotificationType
from app.models.order import Order, OrderStatus
from app.models.payment import PaidSalesActivation, Payment, PaymentStatus
from app.models.promo import PromoRedemption, PromoRedemptionStatus, PromotionalCampaign
from app.models.refund import Refund, RefundStatus
from app.models.setting import EventReport, EventReportStatus, PlatformSetting
from app.models.support import SupportAudience, SupportCase, SupportCategory, SupportStatus
from app.models.user import OrganizerProfile, RefreshToken, User, UserRole
from app.schemas.admin import PromoActivityOut
from app.services.audit_service import audit
from app.services.notification_service import notify
from app.services.payments import activation as activation_service
from app.services.payments import fees

CSV_KINDS = ("orders", "payments", "refunds", "users", "events")
CSV_MAX_ROWS = 10_000


# --------------------------------------------------------------------------- search


def _like(term: str) -> str:
    escaped = term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


def _between(stmt: Select[Any], column: Any, start: datetime | None, end: datetime | None) -> Any:
    if start is not None:
        stmt = stmt.where(column >= start)
    if end is not None:
        stmt = stmt.where(column < end)
    return stmt


def users_stmt(
    q: str | None,
    role: UserRole | None,
    suspended: bool | None,
    start: datetime | None,
    end: datetime | None,
) -> Select[Any]:
    stmt = select(User).order_by(User.created_at.desc(), User.id)
    if q:
        stmt = stmt.where(or_(User.email.ilike(_like(q)), User.full_name.ilike(_like(q))))
    if role is not None:
        stmt = stmt.where(User.role == role)
    if suspended is not None:
        stmt = stmt.where(User.is_suspended == suspended)
    return _between(stmt, User.created_at, start, end)


def events_stmt(
    q: str | None, status: EventStatus | None, start: datetime | None, end: datetime | None
) -> Select[Any]:
    stmt = select(Event).order_by(Event.created_at.desc(), Event.id)
    if q:
        stmt = stmt.where(Event.title.ilike(_like(q)))
    if status is not None:
        stmt = stmt.where(Event.status == status)
    return _between(stmt, Event.created_at, start, end)


def orders_stmt(
    q: str | None,
    status: OrderStatus | None,
    event_id: uuid.UUID | None,
    start: datetime | None,
    end: datetime | None,
) -> Select[Any]:
    stmt = select(Order).order_by(Order.created_at.desc(), Order.id)
    if q:
        stmt = stmt.where(
            or_(Order.order_number.ilike(_like(q)), Order.buyer_email.ilike(_like(q)))
        )
    if status is not None:
        stmt = stmt.where(Order.status == status)
    if event_id is not None:
        stmt = stmt.where(Order.event_id == event_id)
    return _between(stmt, Order.created_at, start, end)


def payments_stmt(
    q: str | None, status: PaymentStatus | None, start: datetime | None, end: datetime | None
) -> Select[Any]:
    stmt = select(Payment).order_by(Payment.created_at.desc(), Payment.id)
    if q:
        stmt = stmt.where(Payment.provider_ref.ilike(_like(q)))
    if status is not None:
        stmt = stmt.where(Payment.status == status)
    return _between(stmt, Payment.created_at, start, end)


def refunds_stmt(
    status: RefundStatus | None, start: datetime | None, end: datetime | None
) -> Select[Any]:
    stmt = select(Refund).order_by(Refund.created_at.desc(), Refund.id)
    if status is not None:
        stmt = stmt.where(Refund.status == status)
    return _between(stmt, Refund.created_at, start, end)


async def list_activations(db: AsyncSession, params: PageParams, status: str | None) -> Page[Any]:
    stmt = select(PaidSalesActivation).order_by(
        PaidSalesActivation.created_at.desc(), PaidSalesActivation.id
    )
    if status is not None:
        stmt = stmt.where(PaidSalesActivation.status == status)
    return await paginate(db, stmt, params)


# ------------------------------------------------------------------------ monitors


async def disputes(db: AsyncSession, limit: int) -> tuple[list[Refund], list[SupportCase]]:
    failed_refunds = await db.scalars(
        select(Refund)
        .where(Refund.status == RefundStatus.failed)
        .order_by(Refund.created_at.desc(), Refund.id)
        .limit(limit)
    )
    cases = await db.scalars(
        select(SupportCase)
        .where(
            SupportCase.category.in_([SupportCategory.payment, SupportCategory.refund]),
            SupportCase.status != SupportStatus.resolved,
        )
        .order_by(SupportCase.created_at.desc(), SupportCase.id)
        .limit(limit)
    )
    return list(failed_refunds), list(cases)


def escalated_cases_stmt(status: SupportStatus | None) -> Select[Any]:
    """Organizer cases are handled by the platform (P10), so every unresolved one is escalated
    to admins; `status` narrows it further."""
    stmt = (
        select(SupportCase)
        .where(SupportCase.audience == SupportAudience.organizer_case)
        .order_by(SupportCase.created_at.desc(), SupportCase.id)
    )
    if status is not None:
        stmt = stmt.where(SupportCase.status == status)
    else:
        stmt = stmt.where(SupportCase.status != SupportStatus.resolved)
    return stmt


async def promo_activity(db: AsyncSession, params: PageParams) -> Page[PromoActivityOut]:
    applied = (
        select(
            PromoRedemption.campaign_id.label("campaign_id"),
            func.count().label("applied"),
            func.coalesce(func.sum(PromoRedemption.discount_amount), 0).label("discount"),
        )
        .where(PromoRedemption.status == PromoRedemptionStatus.applied)
        .group_by(PromoRedemption.campaign_id)
        .subquery()
    )
    stmt = (
        select(
            PromotionalCampaign,
            func.coalesce(applied.c.applied, 0),
            func.coalesce(applied.c.discount, 0),
        )
        .outerjoin(applied, applied.c.campaign_id == PromotionalCampaign.id)
        .order_by(PromotionalCampaign.created_at.desc(), PromotionalCampaign.id)
    )
    total = await db.scalar(select(func.count()).select_from(PromotionalCampaign)) or 0
    rows = await db.execute(stmt.limit(params.limit).offset(params.offset))
    items = [
        PromoActivityOut(
            campaign_id=campaign.id,
            event_id=campaign.event_id,
            name=campaign.name,
            is_enabled=campaign.is_enabled,
            max_redemptions=campaign.max_redemptions,
            redemptions_count=campaign.redemptions_count,
            applied_redemptions=int(count),
            discount_total=int(discount),
        )
        for campaign, count, discount in rows
    ]
    return Page(items=items, total=total, limit=params.limit, offset=params.offset)


# ---------------------------------------------------------------------- suspension


async def set_user_suspension(
    db: AsyncSession, admin: User, user_id: uuid.UUID, suspended: bool, reason: str
) -> User:
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise NotFoundError("User not found.", code="user_not_found")
    if suspended and user.id == admin.id:
        raise ConflictError("You cannot suspend your own account.", code="cannot_suspend_self")
    if suspended and user.role == UserRole.platform_admin:
        raise ConflictError("Platform admins cannot be suspended.", code="cannot_suspend_admin")
    if user.is_suspended != suspended:
        user.is_suspended = suspended
        if suspended:
            # Blocks refresh immediately; get_current_user already blocks the access token.
            await db.execute(
                update(RefreshToken)
                .where(RefreshToken.user_id == user.id, RefreshToken.revoked_at.is_(None))
                .values(revoked_at=datetime.now(UTC))
            )
        audit(
            db,
            action_type="user.suspended" if suspended else "user.resumed",
            entity_type="user",
            entity_id=user.id,
            actor=admin,
            description=f"User {'suspended' if suspended else 'reinstated'} by an admin",
            metadata={"reason": reason},
        )
    await db.commit()
    await db.refresh(user)
    return user


async def _organizer_user(db: AsyncSession, event: Event) -> User | None:
    return await db.scalar(
        select(User)
        .join(OrganizerProfile, OrganizerProfile.user_id == User.id)
        .where(OrganizerProfile.id == event.organizer_id)
    )


async def _locked_event(db: AsyncSession, event_id: uuid.UUID) -> Event:
    event = await db.scalar(select(Event).where(Event.id == event_id).with_for_update())
    if event is None:
        raise NotFoundError("Event not found.", code="event_not_found")
    return event


async def set_event_suspension(
    db: AsyncSession, admin: User, event_id: uuid.UUID, suspended: bool, reason: str
) -> Event:
    """Suspend: hide the event, block holds and checkout, and stop paid sales. Existing orders
    and tickets are untouched (cancelling and refunding stays a separate, deliberate action)."""
    event = await _locked_event(db, event_id)
    if suspended:
        if event.status != EventStatus.published:
            raise ConflictError(
                "Only published events can be suspended.", code="invalid_event_status"
            )
        event.status = EventStatus.suspended
        if event.paid_sales_status == PaidSalesStatus.active:
            await activation_service.suspend_paid_sales(db, event, reason, admin)
    else:
        if event.status != EventStatus.suspended:
            raise ConflictError("Event is not suspended.", code="invalid_event_status")
        event.status = EventStatus.published
        if event.paid_sales_status == PaidSalesStatus.suspended:
            await activation_service.resume_paid_sales(db, event, admin)
    audit(
        db,
        action_type="event.suspended" if suspended else "event.resumed",
        entity_type="event",
        entity_id=event.id,
        event_id=event.id,
        actor=admin,
        description=f"Event {'suspended' if suspended else 'reinstated'} by an admin",
        metadata={"reason": reason},
    )
    organizer = await _organizer_user(db, event)
    if organizer is not None:
        message = (
            "A platform admin suspended this event. It is hidden and ticket sales are paused."
            if suspended
            else "A platform admin lifted the suspension. The event is live again."
        )
        await notify(
            db,
            NotificationType.event_update,
            organizer,
            {"event_id": str(event.id), "message": message},
        )
    await db.commit()
    await db.refresh(event)
    return event


async def set_paid_sales_suspension(
    db: AsyncSession, admin: User, event_id: uuid.UUID, suspended: bool, reason: str
) -> PaidSalesActivation:
    event = await _locked_event(db, event_id)
    if suspended:
        if event.paid_sales_status != PaidSalesStatus.active:
            raise ConflictError("Paid sales are not active.", code="paid_sales_not_active")
        activation = await activation_service.suspend_paid_sales(db, event, reason, admin)
    else:
        if event.paid_sales_status != PaidSalesStatus.suspended:
            raise ConflictError("Paid sales are not suspended.", code="paid_sales_not_suspended")
        activation = await activation_service.resume_paid_sales(db, event, admin)
    await db.commit()
    await db.refresh(activation)
    return activation


# ------------------------------------------------------------------------- reports


async def create_event_report(
    db: AsyncSession, reporter: User, event_id: uuid.UUID, reason: str
) -> EventReport:
    event = await db.get(Event, event_id)
    if (
        event is None
        or event.status != EventStatus.published
        or event.visibility == EventVisibility.private
    ):
        # Same answer as the public API, so drafts and private events are not revealed.
        raise NotFoundError("Event not found.", code="event_not_found")
    report = EventReport(event_id=event_id, reporter_id=reporter.id, reason=reason)
    db.add(report)
    await db.flush()
    audit(
        db,
        action_type="event_report.created",
        entity_type="event_report",
        entity_id=report.id,
        event_id=event_id,
        actor=reporter,
        description="Event reported",
    )
    await db.commit()
    await db.refresh(report)
    return report


def event_reports_stmt(status: EventReportStatus | None) -> Select[Any]:
    stmt = select(EventReport).order_by(EventReport.created_at.desc(), EventReport.id)
    if status is not None:
        stmt = stmt.where(EventReport.status == status)
    return stmt


async def review_event_report(
    db: AsyncSession, admin: User, report_id: uuid.UUID, status: EventReportStatus
) -> EventReport:
    report = await db.scalar(
        select(EventReport).where(EventReport.id == report_id).with_for_update()
    )
    if report is None:
        raise NotFoundError("Report not found.", code="report_not_found")
    if report.status != status:
        report.status = status
        audit(
            db,
            action_type=f"event_report.{status.value}",
            entity_type="event_report",
            entity_id=report.id,
            event_id=report.event_id,
            actor=admin,
            description=f"Event report marked {status.value}",
        )
    await db.commit()
    await db.refresh(report)
    return report


# ------------------------------------------------------------------------ settings

_INT_MIN: dict[str, int] = {
    fees.ACTIVATION_FEE_KEY: 1,
    fees.PAYOUT_DELAY_KEY: 0,
    fees.HOLD_MINUTES_KEY: 1,
}


def _validated(key: str, value: Any) -> Any:
    if key in _INT_MIN:
        if isinstance(value, bool) or not isinstance(value, int) or value < _INT_MIN[key]:
            raise UnprocessableError(
                f"'{key}' must be a whole number of at least {_INT_MIN[key]}.",
                code="invalid_setting",
                details={"key": key},
            )
        return value
    if key == fees.PROCESSING_FEE_KEY:
        if isinstance(value, bool) or not isinstance(value, int | float | str):
            raise UnprocessableError(
                f"'{key}' must be a number from 0 to 100.",
                code="invalid_setting",
                details={"key": key},
            )
        try:
            percent = Decimal(str(value))
        except InvalidOperation:
            percent = Decimal(-1)
        if not percent.is_finite() or not 0 <= percent <= 100:
            raise UnprocessableError(
                f"'{key}' must be a number from 0 to 100.",
                code="invalid_setting",
                details={"key": key},
            )
        return float(percent)
    raise UnprocessableError(
        f"Unknown setting '{key}'.", code="unknown_setting", details={"key": key}
    )


async def effective_settings(db: AsyncSession) -> dict[str, Any]:
    return {
        fees.ACTIVATION_FEE_KEY: (await fees.activation_fee(db)).amount,
        fees.PROCESSING_FEE_KEY: float(await fees.processing_fee_percent(db)),
        fees.PAYOUT_DELAY_KEY: await fees.payout_delay_days(db),
        fees.HOLD_MINUTES_KEY: await fees.hold_minutes(db),
    }


async def update_settings(db: AsyncSession, admin: User, values: dict[str, Any]) -> dict[str, Any]:
    clean = {key: _validated(key, value) for key, value in values.items()}
    before = await effective_settings(db)
    for key, value in clean.items():
        row = await db.get(PlatformSetting, key)
        if row is None:
            db.add(PlatformSetting(key=key, value=value, updated_by=admin.id))
        else:
            row.value = value
            row.updated_by = admin.id
    audit(
        db,
        action_type="settings.updated",
        entity_type="platform_settings",
        entity_id=admin.id,
        actor=admin,
        description="Platform settings updated",
        metadata={"before": {k: before[k] for k in clean}, "after": clean},
    )
    await db.commit()
    return await effective_settings(db)


# ---------------------------------------------------------------------------- CSV

_CSV_COLUMNS: dict[str, tuple[str, ...]] = {
    "orders": (
        "order_number",
        "event_id",
        "buyer_email",
        "status",
        "subtotal",
        "discount_amount",
        "processing_fee",
        "total",
        "currency",
        "is_simulated",
        "created_at",
    ),
    "payments": (
        "id",
        "order_id",
        "kind",
        "provider",
        "provider_ref",
        "status",
        "amount",
        "fee_amount",
        "currency",
        "is_simulated",
        "failure_reason",
        "created_at",
    ),
    "refunds": (
        "id",
        "order_id",
        "payment_id",
        "amount",
        "currency",
        "status",
        "reason",
        "created_at",
    ),
    "users": ("id", "email", "full_name", "role", "is_suspended", "created_at"),
    "events": (
        "id",
        "organizer_id",
        "title",
        "status",
        "paid_sales_status",
        "starts_at",
        "created_at",
    ),
}
_MODELS: dict[str, Any] = {
    "orders": Order,
    "payments": Payment,
    "refunds": Refund,
    "users": User,
    "events": Event,
}


def csv_safe(value: Any) -> str:
    """Stringify one cell and defuse spreadsheet formulas (`=`, `+`, `-`, `@`, tab, CR)."""
    if value is None:
        return ""
    if hasattr(value, "value") and not isinstance(value, str):
        value = value.value
    if isinstance(value, int | float) and not isinstance(value, bool):
        return str(value)  # real numbers (negative refunds, say) are not formulas
    text = value.isoformat() if isinstance(value, datetime) else str(value)
    if text and text[0] in "=+-@\t\r":
        return "'" + text
    return text


async def csv_report(
    db: AsyncSession, kind: str, start: datetime | None, end: datetime | None
) -> Iterator[str]:
    if kind not in CSV_KINDS:
        raise NotFoundError("Unknown report.", code="report_kind_not_found")
    model = _MODELS[kind]
    stmt = select(model).order_by(model.created_at.desc(), model.id).limit(CSV_MAX_ROWS)
    rows = list(await db.scalars(_between(stmt, model.created_at, start, end)))
    columns = _CSV_COLUMNS[kind]

    def generate() -> Iterator[str]:
        buffer = io.StringIO()
        writer = csv.writer(buffer)
        writer.writerow(columns)
        yield buffer.getvalue()
        for row in rows:
            buffer.seek(0)
            buffer.truncate()
            writer.writerow([csv_safe(getattr(row, column)) for column in columns])
            yield buffer.getvalue()

    return generate()
