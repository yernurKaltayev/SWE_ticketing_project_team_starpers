"""P5 order checkout and attendee/organizer read endpoints."""

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Header, Query, Response, status

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import Page, Pagination
from app.schemas.order import AttendeeOut, OrderCreate, OrderOut
from app.services import order_service

router = APIRouter(tags=["orders"])


@router.post("/orders", response_model=OrderOut, status_code=status.HTTP_201_CREATED)
async def create_order(
    data: OrderCreate,
    user: CurrentUser,
    db: DbSession,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
) -> OrderOut:
    try:
        return await order_service.create_order(db, user, data, idempotency_key)
    except Exception:
        await db.rollback()
        raise


@router.get("/orders/{order_id}", response_model=OrderOut)
async def get_order(order_id: UUID, user: CurrentUser, db: DbSession) -> OrderOut:
    return await order_service.get_order(db, user, order_id)


@router.post("/orders/{order_id}/cancel", response_model=OrderOut)
async def cancel_order(order_id: UUID, user: CurrentUser, db: DbSession) -> OrderOut:
    try:
        return await order_service.cancel_order(db, user, order_id)
    except Exception:
        await db.rollback()
        raise


@router.get("/me/orders", response_model=Page[OrderOut])
async def my_orders(user: CurrentUser, db: DbSession, params: Pagination) -> Page[OrderOut]:
    return await order_service.list_user_orders(db, user, params)


@router.get("/events/{event_id}/orders", response_model=Page[OrderOut])
async def event_orders(
    event_id: UUID,
    user: CurrentUser,
    db: DbSession,
    params: Pagination,
) -> Page[OrderOut]:
    return await order_service.list_event_orders(db, user, event_id, params)


@router.get("/events/{event_id}/attendees", response_model=Page[AttendeeOut])
async def attendees(
    event_id: UUID,
    user: CurrentUser,
    db: DbSession,
    params: Pagination,
    q: Annotated[str | None, Query(max_length=100)] = None,
    ticket_type_id: UUID | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> Page[AttendeeOut]:
    return await order_service.list_attendees(
        db,
        user,
        event_id,
        params,
        q=q,
        ticket_type_id=ticket_type_id,
        status=status_filter,
    )


@router.get(
    "/events/{event_id}/attendees.csv",
    response_class=Response,
    responses={200: {"content": {"text/csv": {"schema": {"type": "string"}}}}},
)
async def attendees_csv(
    event_id: UUID,
    user: CurrentUser,
    db: DbSession,
    q: Annotated[str | None, Query(max_length=100)] = None,
    ticket_type_id: UUID | None = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
) -> Response:
    body = await order_service.export_attendees_csv(
        db,
        user,
        event_id,
        q=q,
        ticket_type_id=ticket_type_id,
        status=status_filter,
    )
    return Response(
        content="\ufeff" + body,  # UTF-8 BOM for Excel/Cyrillic names
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="attendees-{event_id}.csv"'},
    )
