"""P3 authenticated ticket management and public availability endpoints."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, DbSession, require_event_access
from app.models.event import Event
from app.models.user import StaffRole
from app.schemas.ticket_type_p3 import (
    EventAvailability,
    TicketTypeCreate,
    TicketTypeOut,
    TicketTypeUpdate,
)
from app.services import ticket_type_service

router = APIRouter(tags=["ticket-types"])
ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]


@router.get("/events/{event_id}/ticket-types", response_model=list[TicketTypeOut])
async def ticket_types(event: ManagedEvent, db: DbSession) -> list[TicketTypeOut]:
    return await ticket_type_service.list_ticket_types(db, event.id)


@router.post(
    "/events/{event_id}/ticket-types",
    response_model=TicketTypeOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_ticket_type(
    data: TicketTypeCreate,
    event: ManagedEvent,
    user: CurrentUser,
    db: DbSession,
) -> TicketTypeOut:
    return await ticket_type_service.create_ticket_type(db, event.id, user, data)


@router.patch("/events/{event_id}/ticket-types/{ticket_type_id}", response_model=TicketTypeOut)
async def patch_ticket_type(
    ticket_type_id: uuid.UUID,
    data: TicketTypeUpdate,
    event: ManagedEvent,
    user: CurrentUser,
    db: DbSession,
) -> TicketTypeOut:
    return await ticket_type_service.update_ticket_type(db, event.id, ticket_type_id, user, data)


@router.get("/events/{event_id}/availability", response_model=EventAvailability)
async def get_availability(event_id: uuid.UUID, db: DbSession) -> EventAvailability:
    return await ticket_type_service.public_availability(db, event_id)
