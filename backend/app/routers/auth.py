"""/auth/* [P1 Yernur]"""

from fastapi import APIRouter, BackgroundTasks, Request, status

from app.core.deps import CurrentUser, DbSession
from app.core.rate_limit import enforce_auth_rate_limit
from app.models.user import User
from app.schemas.auth import (
    ForgotPasswordIn,
    LoginIn,
    RefreshIn,
    RegisterIn,
    ResendVerificationIn,
    ResetPasswordIn,
    TokenOut,
    VerifyEmailIn,
)
from app.schemas.common import MessageOut
from app.schemas.user import UserOut
from app.services import auth_service
from app.services.email_verification import send_password_reset_email, send_verification_email

router = APIRouter(prefix="/auth", tags=["auth"])

# The same answer whether or not the account exists, so these endpoints cannot be used to find out.
RESEND_ACCEPTED = "If this address needs confirming, a new link is on its way."
RESET_ACCEPTED = "If an account exists for this address, a reset link is on its way."


@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(
    data: RegisterIn, request: Request, db: DbSession, background: BackgroundTasks
) -> User:
    enforce_auth_rate_limit(request, "register")
    user, token = await auth_service.register(db, data)
    # After the response: a slow mail server must not hold up the request.
    background.add_task(send_verification_email, user.email, token)
    return user


@router.post("/verify-email")
async def verify_email(data: VerifyEmailIn, db: DbSession) -> MessageOut:
    await auth_service.verify_email(db, data.token)
    return MessageOut(message="Your email is confirmed.")


@router.post("/resend-verification")
async def resend_verification(
    data: ResendVerificationIn, request: Request, db: DbSession, background: BackgroundTasks
) -> MessageOut:
    enforce_auth_rate_limit(request, "resend-verification", data.email)
    pending = await auth_service.resend_verification(db, data.email)
    if pending is not None:
        background.add_task(send_verification_email, *pending)
    return MessageOut(message=RESEND_ACCEPTED)


@router.post("/login")
async def login(data: LoginIn, request: Request, db: DbSession) -> TokenOut:
    enforce_auth_rate_limit(request, "login", data.email)
    return await auth_service.login(db, data.email, data.password)


@router.post("/refresh")
async def refresh(data: RefreshIn, db: DbSession) -> TokenOut:
    return await auth_service.refresh(db, data.refresh_token)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(data: RefreshIn, user: CurrentUser, db: DbSession) -> None:
    await auth_service.logout(db, user, data.refresh_token)


@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordIn, request: Request, db: DbSession, background: BackgroundTasks
) -> MessageOut:
    enforce_auth_rate_limit(request, "forgot-password", data.email)
    pending = await auth_service.forgot_password(db, data.email)
    if pending is not None:
        background.add_task(send_password_reset_email, *pending)
    return MessageOut(message=RESET_ACCEPTED)


@router.post("/reset-password")
async def reset_password(data: ResetPasswordIn, request: Request, db: DbSession) -> MessageOut:
    enforce_auth_rate_limit(request, "reset-password")
    await auth_service.reset_password(db, data.token, data.new_password)
    return MessageOut(message="Your password has been changed. Sign in with the new one.")
