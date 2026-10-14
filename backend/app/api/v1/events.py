from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Body, Query

from app.core.deps import CurrentUser, DbSession, OptionalUser
from app.schemas.auth import MessageResponse
from app.schemas.event import (
    ActivationRequest,
    AuditRead,
    EventRead,
    EventWrite,
    StaffRequest,
    SuspensionRequest,
    TicketTypeWrite,
)
from app.services import events

router = APIRouter(prefix="/events", tags=["events"])


@router.get("", response_model=list[EventRead])
async def list_events(
    db: DbSession,
    user: OptionalUser,
    scope: Literal["public", "mine", "all"] = "public",
    q: str = "",
    city: str = "",
    category: str = "",
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
):
    return await events.list_events(
        db, user, scope=scope, q=q, city=city, category=category, limit=limit
    )


@router.post("", response_model=EventRead, status_code=201)
async def create_event(data: EventWrite, user: CurrentUser, db: DbSession):
    return await events.create_event(db, user, data)


@router.post("/samples", response_model=MessageResponse)
async def sample_events(user: CurrentUser, db: DbSession):
    await events.sample_events(db, user)
    return MessageResponse(detail="sample events created; no sample purchases were invented")


@router.get("/{event_id}", response_model=EventRead)
async def get_event(event_id: UUID, user: OptionalUser, db: DbSession):
    return await events.event_read(db, await events.get_event(db, event_id, user))


@router.put("/{event_id}", response_model=EventRead)
async def update_event(event_id: UUID, data: EventWrite, user: CurrentUser, db: DbSession):
    return await events.update_event(db, user, event_id, data)


@router.get("/{event_id}/ticket-types", response_model=list[TicketTypeWrite])
async def get_ticket_types(event_id: UUID, user: OptionalUser, db: DbSession):
    await events.get_event(db, event_id, user)
    return [events.type_read(t) for t in await events.types_for(db, event_id)]


@router.put("/{event_id}/ticket-types", response_model=list[TicketTypeWrite])
async def set_ticket_types(
    event_id: UUID,
    data: Annotated[list[TicketTypeWrite], Body(min_length=1, max_length=20)],
    user: CurrentUser,
    db: DbSession,
):
    return await events.set_types(db, user, event_id, data)


@router.post("/{event_id}/duplicate", response_model=EventRead, status_code=201)
async def duplicate_event(event_id: UUID, user: CurrentUser, db: DbSession):
    return await events.duplicate_event(db, user, event_id)


@router.post("/{event_id}/activation", response_model=EventRead)
async def activate(event_id: UUID, data: ActivationRequest, user: CurrentUser, db: DbSession):
    return await events.activate(db, user, event_id, data)


@router.post("/{event_id}/suspension", response_model=EventRead)
async def suspend(event_id: UUID, data: SuspensionRequest, user: CurrentUser, db: DbSession):
    return await events.suspend(db, user, event_id, data.suspended)


@router.get("/{event_id}/audit", response_model=list[AuditRead])
async def history(event_id: UUID, user: CurrentUser, db: DbSession):
    return await events.history(db, user, event_id)


@router.post("/{event_id}/staff", response_model=MessageResponse)
async def assign_staff(event_id: UUID, data: StaffRequest, user: CurrentUser, db: DbSession):
    return await events.assign_staff(db, user, event_id, data.email)


@router.delete("/{event_id}/staff/{staff_id}", response_model=MessageResponse)
async def revoke_staff(event_id: UUID, staff_id: UUID, user: CurrentUser, db: DbSession):
    await events.revoke_staff(db, user, event_id, staff_id)
    return MessageResponse(detail="staff assignment removed")


@router.post("/{event_id}/{action}", response_model=EventRead)
async def status_action(
    event_id: UUID,
    action: Literal["publish", "unpublish", "cancel"],
    user: CurrentUser,
    db: DbSession,
):
    return await events.status_action(db, user, event_id, action)
