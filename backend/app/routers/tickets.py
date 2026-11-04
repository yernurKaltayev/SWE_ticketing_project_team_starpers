"""/tickets, /pdf, /me/tickets [P8 Dima]"""

import uuid

from fastapi import APIRouter
from fastapi.responses import Response

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import Page, Pagination
from app.schemas.ticket import TicketOut
from app.services import ticket_service

router = APIRouter(tags=["tickets"])

# Tickets are bearer credentials: keep them out of shared caches.
PRIVATE = {"Cache-Control": "private, no-store"}


@router.get("/me/tickets", response_model=Page[TicketOut])
async def list_my_tickets(user: CurrentUser, db: DbSession, page: Pagination) -> Page[TicketOut]:
    return await ticket_service.list_user_tickets(db, user, page)


@router.get("/tickets/{ticket_id}", response_model=TicketOut)
async def get_ticket(ticket_id: uuid.UUID, user: CurrentUser, db: DbSession) -> TicketOut:
    ticket = await ticket_service.get_accessible_ticket(db, user, ticket_id)
    return (await ticket_service.to_ticket_out(db, [ticket]))[0]


@router.get(
    "/tickets/{ticket_id}/qr",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
async def get_ticket_qr(ticket_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    ticket = await ticket_service.get_accessible_ticket(db, user, ticket_id)
    return Response(ticket_service.get_qr_png(ticket), media_type="image/png", headers=PRIVATE)


@router.get(
    "/tickets/{ticket_id}/pdf",
    response_class=Response,
    responses={200: {"content": {"application/pdf": {}}}},
)
async def get_ticket_pdf(ticket_id: uuid.UUID, user: CurrentUser, db: DbSession) -> Response:
    ticket = await ticket_service.get_accessible_ticket(db, user, ticket_id)
    pdf = await ticket_service.get_ticket_pdf(db, ticket)
    headers = PRIVATE | {"Content-Disposition": f'inline; filename="{ticket.ticket_number}.pdf"'}
    return Response(pdf, media_type="application/pdf", headers=headers)
