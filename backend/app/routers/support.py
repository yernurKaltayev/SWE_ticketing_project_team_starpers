"""/support/cases [P10 Yernur]

Support chat is REST + polling: clients poll `GET .../messages?after=<last message id>`.
"""

import uuid
from typing import Any

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import Page, Pagination
from app.models.support import SupportCase, SupportMessage, SupportStatus
from app.schemas.support import CaseCreate, CaseOut, CaseUpdate, MessageIn, SupportMessageOut
from app.services import support_service
from app.services.support_service import CaseRole

router = APIRouter(tags=["support"])


@router.get("/support/cases", response_model=Page[CaseOut])
async def list_cases(
    user: CurrentUser,
    db: DbSession,
    page: Pagination,
    status: SupportStatus | None = Query(None, description="Only cases with this status"),
    event_id: uuid.UUID | None = Query(None, description="Only cases about this event"),
    role: CaseRole | None = Query(
        None, description="requester: cases I opened; handler: cases I handle. Default: both"
    ),
) -> Page[Any]:
    return await support_service.list_cases(
        db, user, page, status=status, event_id=event_id, role=role
    )


@router.post("/support/cases", response_model=CaseOut, status_code=201)
async def create_case(payload: CaseCreate, user: CurrentUser, db: DbSession) -> SupportCase:
    return await support_service.create_case(db, user, payload)


@router.get("/support/cases/{case_id}", response_model=CaseOut)
async def get_case(case_id: uuid.UUID, user: CurrentUser, db: DbSession) -> SupportCase:
    return await support_service.get_case(db, user, case_id)


@router.patch("/support/cases/{case_id}", response_model=CaseOut)
async def update_case(
    case_id: uuid.UUID, payload: CaseUpdate, user: CurrentUser, db: DbSession
) -> SupportCase:
    return await support_service.update_case(db, user, case_id, payload)


@router.get("/support/cases/{case_id}/messages", response_model=list[SupportMessageOut])
async def list_messages(
    case_id: uuid.UUID,
    user: CurrentUser,
    db: DbSession,
    after: uuid.UUID | None = Query(None, description="Return only messages after this one"),
) -> list[SupportMessage]:
    return await support_service.list_messages(db, user, case_id, after)


@router.post("/support/cases/{case_id}/messages", response_model=SupportMessageOut, status_code=201)
async def post_message(
    case_id: uuid.UUID, payload: MessageIn, user: CurrentUser, db: DbSession
) -> SupportMessage:
    return await support_service.post_message(db, user, case_id, payload.body)
