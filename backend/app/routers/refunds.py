"""/orders/{order_id}/refund, refund policy and refund lists [P7 Dima]"""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.core.deps import CurrentUser, DbSession, require_event_access
from app.core.pagination import Page, Pagination
from app.models.event import Event
from app.models.user import StaffRole
from app.schemas.event import EventOut, RefundPolicyIn
from app.schemas.refund import RefundIn, RefundOut
from app.services import event_service, refund_service

router = APIRouter(tags=["refunds"])

ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]


@router.put("/events/{event_id}/refund-policy", response_model=EventOut)
async def set_refund_policy(
    data: RefundPolicyIn, event: ManagedEvent, user: CurrentUser, db: DbSession
) -> EventOut:
    updated = await refund_service.set_refund_policy(db, user, event, data)
    return event_service._out(updated, reveal_token=True)


@router.post(
    "/orders/{order_id}/refund", response_model=RefundOut, status_code=status.HTTP_201_CREATED
)
async def refund_order(
    order_id: uuid.UUID, data: RefundIn, user: CurrentUser, db: DbSession
) -> RefundOut:
    try:
        return await refund_service.refund_order(db, user, order_id, data.reason)
    except Exception:
        # A refused provider refund must leave tickets and inventory exactly as they were.
        await db.rollback()
        raise


@router.get("/events/{event_id}/refunds", response_model=Page[RefundOut])
async def list_refunds(event: ManagedEvent, db: DbSession, params: Pagination) -> Page[RefundOut]:
    return await refund_service.list_refunds(db, event, params)
