"""/me/notifications [P9 Yernur]"""

import uuid
from typing import Any

from fastapi import APIRouter, Query

from app.core.deps import CurrentUser, DbSession
from app.core.pagination import Page, Pagination
from app.models.notification import Notification
from app.schemas.notification import NotificationOut
from app.services import notification_service

router = APIRouter(tags=["notifications"])


@router.get("/me/notifications", response_model=Page[NotificationOut])
async def list_my_notifications(
    user: CurrentUser,
    db: DbSession,
    page: Pagination,
    unread_only: bool = Query(False, description="Only notifications not yet marked as read"),
) -> Page[Any]:
    return await notification_service.list_for_user(db, user, page, unread_only=unread_only)


@router.post("/me/notifications/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: uuid.UUID, user: CurrentUser, db: DbSession
) -> Notification:
    return await notification_service.mark_read(db, user, notification_id)
