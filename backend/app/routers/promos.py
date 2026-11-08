"""/campaigns, /promo/validate, and the public /c/{token} resolver [P16 Dima]."""

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import RedirectResponse

from app.core.deps import CurrentUser, DbSession, check_event_access, require_event_access
from app.core.pagination import Page, Pagination
from app.models.event import Event
from app.models.promo import PromotionalCampaign
from app.models.user import StaffRole
from app.schemas.promo import (
    CampaignIn,
    CampaignOut,
    CampaignReportOut,
    CampaignUpdate,
    PromoValidateIn,
    PromoValidateOut,
)
from app.services import promo_service

router = APIRouter(tags=["promos"])
# Mounted at the site root, not /api/v1: Campaign QR codes encode this link.
public_router = APIRouter(tags=["promos"])

ManagedEvent = Annotated[Event, Depends(require_event_access(StaffRole.manager))]


async def _managed_campaign(
    campaign_id: uuid.UUID, db: DbSession, user: CurrentUser
) -> PromotionalCampaign:
    campaign = await promo_service.get_campaign_row(db, campaign_id)
    await check_event_access(db, user, campaign.event_id, StaffRole.manager)
    return campaign


ManagedCampaign = Annotated[PromotionalCampaign, Depends(_managed_campaign)]


@router.get("/events/{event_id}/campaigns", response_model=Page[CampaignOut])
async def list_campaigns(
    event: ManagedEvent, db: DbSession, params: Pagination
) -> Page[CampaignOut]:
    return await promo_service.list_campaigns(db, event, params)


@router.post(
    "/events/{event_id}/campaigns",
    response_model=CampaignOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_campaign(
    data: CampaignIn, event: ManagedEvent, user: CurrentUser, db: DbSession
) -> CampaignOut:
    return await promo_service.create_campaign(db, user, event, data)


@router.get("/campaigns/{campaign_id}", response_model=CampaignOut)
async def get_campaign(campaign: ManagedCampaign, db: DbSession) -> CampaignOut:
    return await promo_service.to_campaign_out(db, campaign)


@router.patch("/campaigns/{campaign_id}", response_model=CampaignOut)
async def update_campaign(
    data: CampaignUpdate, campaign: ManagedCampaign, user: CurrentUser, db: DbSession
) -> CampaignOut:
    return await promo_service.update_campaign(db, user, campaign.id, data)


@router.get(
    "/campaigns/{campaign_id}/qr",
    response_class=Response,
    responses={200: {"content": {"image/png": {}}}},
)
async def campaign_qr(campaign: ManagedCampaign) -> Response:
    return Response(
        content=promo_service.campaign_qr_png(campaign),
        media_type="image/png",
        headers={"Cache-Control": "private, max-age=300"},
    )


@router.get("/campaigns/{campaign_id}/report", response_model=CampaignReportOut)
async def campaign_report(campaign: ManagedCampaign, db: DbSession) -> CampaignReportOut:
    return await promo_service.campaign_report(db, campaign)


@router.post("/promo/validate", response_model=PromoValidateOut)
async def validate_promo(data: PromoValidateIn, db: DbSession) -> PromoValidateOut:
    return await promo_service.validate_code(db, data)


@public_router.get("/c/{token}", response_class=RedirectResponse, status_code=302)
async def resolve_campaign(token: str, db: DbSession) -> RedirectResponse:
    return RedirectResponse(await promo_service.resolve_campaign_link(db, token), status_code=302)
