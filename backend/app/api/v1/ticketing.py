from uuid import UUID

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.schemas.auth import MessageResponse
from app.schemas.event import (
    CheckInRequest,
    CheckoutRead,
    CheckoutRequest,
    EventRead,
    OrderRead,
    OrderWithTickets,
    PriceQuote,
    PromoRead,
    PromoStatusRequest,
    PromoWrite,
    QuoteRequest,
    TicketRead,
    TicketWithEvent,
)
from app.services import analytics, events, ticketing

router = APIRouter(tags=["ticketing"])


@router.post("/events/{event_id}/quote", response_model=PriceQuote)
async def quote(event_id: UUID, data: QuoteRequest, user: OptionalUser, db: DbSession):
    return await ticketing.quote(db, user, event_id, data)


@router.post("/events/{event_id}/checkout", response_model=CheckoutRead)
async def checkout(event_id: UUID, data: CheckoutRequest, user: CurrentUser, db: DbSession):
    return await ticketing.checkout(db, user, event_id, data)


@router.get("/orders/me", response_model=list[OrderWithTickets])
async def my_orders(user: CurrentUser, db: DbSession):
    return await ticketing.my_orders(db, user)


@router.post("/orders/{order_id}/refund", response_model=MessageResponse)
async def refund_order(order_id: UUID, user: CurrentUser, db: DbSession):
    await ticketing.refund_order(db, user, order_id)
    return MessageResponse(detail="order refunded (simulated)")


@router.get("/tickets/{ticket_id}", response_model=TicketWithEvent)
async def my_ticket(ticket_id: UUID, user: CurrentUser, db: DbSession):
    return await ticketing.my_ticket(db, user, ticket_id)


@router.get("/events/{event_id}/orders", response_model=list[OrderRead])
async def event_orders(event_id: UUID, user: CurrentUser, db: DbSession):
    return await ticketing.event_orders(db, user, event_id)


@router.get("/events/{event_id}/tickets", response_model=list[TicketRead])
async def event_tickets(event_id: UUID, user: CurrentUser, db: DbSession):
    return await ticketing.event_tickets(db, user, event_id)


@router.get("/events/{event_id}/promos/validate", response_model=PromoRead)
async def validate_promo(
    event_id: UUID,
    user: OptionalUser,
    db: DbSession,
    code: str = Query(min_length=3, max_length=20),
):
    await events.get_event(db, event_id, user)
    return events.read_model(PromoRead, await ticketing.usable_promo(db, event_id, code))


@router.get("/events/{event_id}/promos", response_model=list[PromoRead])
async def event_promos(event_id: UUID, user: CurrentUser, db: DbSession):
    return await ticketing.event_promos(db, user, event_id)


@router.post("/events/{event_id}/promos", response_model=PromoRead, status_code=201)
async def create_promo(event_id: UUID, data: PromoWrite, user: CurrentUser, db: DbSession):
    return await ticketing.create_promo(db, user, event_id, data)


@router.patch("/promos/{promo_id}", response_model=MessageResponse)
async def set_promo_active(
    promo_id: UUID, data: PromoStatusRequest, user: CurrentUser, db: DbSession
):
    await ticketing.set_promo_active(db, user, promo_id, data.active)
    return MessageResponse(detail="promo updated")


@router.get("/analytics", tags=["analytics"])
async def organizer_analytics(user: CurrentUser, db: DbSession, event_id: UUID | None = None):
    return await analytics.organizer_analytics(db, user, event_id)


@router.get("/checkin/events", response_model=list[EventRead], tags=["check-in"])
async def staff_events(user: CurrentUser, db: DbSession):
    return await ticketing.staff_events(db, user)


@router.post("/checkin/{event_id}", response_model=TicketRead, tags=["check-in"])
async def check_in(event_id: UUID, data: CheckInRequest, user: CurrentUser, db: DbSession):
    return await ticketing.check_in(db, user, event_id, data.code)


@router.delete("/checkin/{event_id}/{ticket_id}", response_model=MessageResponse, tags=["check-in"])
async def undo_check_in(event_id: UUID, ticket_id: UUID, user: CurrentUser, db: DbSession):
    await ticketing.undo_check_in(db, user, event_id, ticket_id)
    return MessageResponse(detail="check-in reversed")
