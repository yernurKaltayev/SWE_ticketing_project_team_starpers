from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import KazakhstanPhone, Name

# The upper bound keeps a request from making the server hash megabytes of input.
NewPassword = Annotated[str, Field(min_length=8, max_length=128)]


class RegisterIn(BaseModel):
    email: EmailStr
    password: NewPassword
    full_name: Name
    role: Literal["attendee", "organizer"]
    # Required at sign-up, stored as +77012345678. Not verified yet.
    phone: KazakhstanPhone


class LoginIn(BaseModel):
    email: EmailStr
    password: str = Field(max_length=128)


class TokenOut(BaseModel):
    access_token: str
    # null when the refresh token was set as an HttpOnly cookie instead (web sessions).
    refresh_token: str | None
    token_type: str = "bearer"  # noqa: S105 - the OAuth2 token type name


class RefreshIn(BaseModel):
    refresh_token: str


class VerifyEmailIn(BaseModel):
    token: str


class ResendVerificationIn(BaseModel):
    email: EmailStr


class ForgotPasswordIn(BaseModel):
    email: EmailStr


class ResetPasswordIn(BaseModel):
    token: str
    new_password: NewPassword
