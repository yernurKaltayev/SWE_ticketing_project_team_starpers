"""/auth/* [P1 Yernur]"""

from typing import Annotated, Literal

from fastapi import APIRouter, BackgroundTasks, Body, Cookie, Header, Request, Response, status

from app.core.config import get_settings
from app.core.deps import BearerCredentials, DbSession, get_current_user
from app.core.errors import AppError, app_error_response
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

# Web sessions (login with X-Auth-Transport: cookie). SameSite=Strict keeps other sites from
# sending them, so refresh and logout need no separate CSRF token.
REFRESH_COOKIE = "biletflow_refresh"
SESSION_COOKIE = "biletflow_session"


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


def _set_session_cookies(response: Response, refresh_token: str) -> None:
    """The refresh token goes where page scripts cannot read it; a readable marker beside it
    lets the web app skip the refresh call for visitors who never signed in."""
    settings = get_settings()
    max_age = settings.refresh_token_ttl_days * 24 * 60 * 60
    response.set_cookie(
        REFRESH_COOKIE,
        refresh_token,
        max_age=max_age,
        path=_refresh_cookie_path(),
        secure=settings.auth_cookie_secure,
        httponly=True,
        samesite="strict",
    )
    response.set_cookie(
        SESSION_COOKIE,
        "1",
        max_age=max_age,
        path="/",
        secure=settings.auth_cookie_secure,
        samesite="strict",
    )


def _clear_session_cookies(response: Response) -> None:
    secure = get_settings().auth_cookie_secure
    response.delete_cookie(
        REFRESH_COOKIE, path=_refresh_cookie_path(), secure=secure, httponly=True, samesite="strict"
    )
    response.delete_cookie(SESSION_COOKIE, path="/", secure=secure, samesite="strict")


def _refresh_cookie_path() -> str:
    return f"{get_settings().api_v1_prefix}/auth"


RefreshCookie = Annotated[str | None, Cookie(alias=REFRESH_COOKIE)]
OptionalRefreshIn = Annotated[RefreshIn | None, Body()]


@router.post("/login")
async def login(
    data: LoginIn,
    request: Request,
    response: Response,
    db: DbSession,
    x_auth_transport: Annotated[Literal["cookie"] | None, Header()] = None,
) -> TokenOut:
    enforce_auth_rate_limit(request, "login", data.email)
    tokens = await auth_service.login(db, data.email, data.password)
    if x_auth_transport == "cookie" and tokens.refresh_token:
        _set_session_cookies(response, tokens.refresh_token)
        tokens.refresh_token = None
    return tokens


@router.post("/refresh", response_model=TokenOut)
async def refresh(
    db: DbSession,
    response: Response,
    refresh_cookie: RefreshCookie = None,
    data: OptionalRefreshIn = None,
) -> TokenOut | Response:
    """A token in the body is answered in the body (mobile). Without one, the cookie is used and
    the replacement goes back into the cookie, never into the JSON (web)."""
    if data is not None:
        return await auth_service.refresh(db, data.refresh_token)
    try:
        if not refresh_cookie:
            raise auth_service.invalid_refresh_token()
        tokens = await auth_service.refresh(db, refresh_cookie)
    except AppError as exc:
        # A stale cookie would fail on every page load: drop it with the error.
        error = app_error_response(exc)
        _clear_session_cookies(error)
        return error
    assert tokens.refresh_token  # noqa: S101 - the service always issues one
    _set_session_cookies(response, tokens.refresh_token)
    tokens.refresh_token = None
    return tokens


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    db: DbSession,
    credentials: BearerCredentials,
    refresh_cookie: RefreshCookie = None,
    data: OptionalRefreshIn = None,
) -> None:
    """A body token needs the bearer of the same account. The cookie alone is enough, so a web
    sign-out still works after the access token has expired."""
    if data is not None:
        user = await get_current_user(db, credentials)
        await auth_service.logout(db, user, data.refresh_token)
        return
    if refresh_cookie:
        await auth_service.revoke_refresh_token(db, refresh_cookie)
    _clear_session_cookies(response)


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
