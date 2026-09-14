from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import CurrentUser, DbSession, require_roles
from app.models.organizer import OrganizerProfile
from app.models.user import User, UserRole
from app.schemas.organizer import OrganizerProfileRead, OrganizerProfileUpsert
from app.schemas.user import UserRead, UserUpdate

router = APIRouter(prefix="/users", tags=["users"])

OrganizerUser = Annotated[User, Depends(require_roles(UserRole.organizer))]
PlatformAdmin = Annotated[User, Depends(require_roles(UserRole.platform_admin))]


@router.get("/me", response_model=UserRead)
async def read_me(user: CurrentUser) -> UserRead:
    return UserRead.model_validate(user)


@router.patch("/me", response_model=UserRead)
async def update_me(data: UserUpdate, user: CurrentUser, db: DbSession) -> UserRead:
    user.full_name = data.full_name.strip()
    await db.commit()
    await db.refresh(user)
    return UserRead.model_validate(user)


@router.get("/me/organizer-profile", response_model=OrganizerProfileRead)
async def read_my_organizer_profile(user: OrganizerUser, db: DbSession) -> OrganizerProfileRead:
    profile = await _get_profile(db, user)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "organizer profile not created yet")
    return OrganizerProfileRead.model_validate(profile)


@router.put("/me/organizer-profile", response_model=OrganizerProfileRead)
async def upsert_my_organizer_profile(
    data: OrganizerProfileUpsert, user: OrganizerUser, db: DbSession
) -> OrganizerProfileRead:
    profile = await _get_profile(db, user)
    if profile is None:
        profile = OrganizerProfile(user_id=user.id, **data.model_dump())
        db.add(profile)
    else:
        for field, value in data.model_dump().items():
            setattr(profile, field, value)
    await db.commit()
    await db.refresh(profile)
    return OrganizerProfileRead.model_validate(profile)


@router.get("", response_model=list[UserRead])
async def list_users(
    _admin: PlatformAdmin,
    db: DbSession,
    limit: Annotated[int, Query(ge=1, le=100)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[UserRead]:
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    )
    return [UserRead.model_validate(user) for user in result.scalars()]


async def _get_profile(db: AsyncSession, user: User) -> OrganizerProfile | None:
    result = await db.execute(
        select(OrganizerProfile).where(OrganizerProfile.user_id == user.id)
    )
    return result.scalar_one_or_none()
