from fastapi import APIRouter, status

from app.core.deps import DbSession
from app.schemas.auth import (
    EmailRequest,
    LoginRequest,
    MessageResponse,
    PasswordResetConfirm,
    RefreshTokenRequest,
    RegisterRequest,
    TokenPair,
    VerifyEmailRequest,
)
from app.schemas.user import UserRead
from app.services import auth as auth_service

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=UserRead, status_code=status.HTTP_201_CREATED)
async def register(data: RegisterRequest, db: DbSession) -> UserRead:
    user, _ = await auth_service.register_user(db, data)
    return UserRead.model_validate(user)


@router.post("/login", response_model=TokenPair)
async def login(data: LoginRequest, db: DbSession) -> TokenPair:
    return await auth_service.login(db, data.email, data.password)


@router.post("/refresh", response_model=TokenPair)
async def refresh(data: RefreshTokenRequest, db: DbSession) -> TokenPair:
    return await auth_service.rotate_refresh_token(db, data.refresh_token)


@router.post("/logout", response_model=MessageResponse)
async def logout(data: RefreshTokenRequest, db: DbSession) -> MessageResponse:
    await auth_service.revoke_refresh_token(db, data.refresh_token)
    return MessageResponse(detail="signed out")


@router.post("/verify-email", response_model=UserRead)
async def verify_email(data: VerifyEmailRequest, db: DbSession) -> UserRead:
    user = await auth_service.verify_email(db, data.token)
    return UserRead.model_validate(user)


@router.post("/resend-verification", response_model=MessageResponse)
async def resend_verification(data: EmailRequest, db: DbSession) -> MessageResponse:
    await auth_service.resend_verification_email(db, data.email)
    return MessageResponse(detail="if the account exists and is unverified, an email was sent")


@router.post("/password-reset/request", response_model=MessageResponse)
async def request_password_reset(data: EmailRequest, db: DbSession) -> MessageResponse:
    await auth_service.request_password_reset(db, data.email)
    return MessageResponse(detail="if the account exists, a reset email was sent")


@router.post("/password-reset/confirm", response_model=MessageResponse)
async def confirm_password_reset(data: PasswordResetConfirm, db: DbSession) -> MessageResponse:
    await auth_service.confirm_password_reset(db, data.token, data.new_password)
    return MessageResponse(detail="password updated")
