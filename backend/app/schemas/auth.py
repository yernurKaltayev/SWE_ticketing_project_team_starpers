from typing import Annotated, Literal

from pydantic import AfterValidator, BaseModel, EmailStr, Field

from app.models.user import UserRole


def _within_bcrypt_limit(value: str) -> str:
    if len(value.encode()) > 72:
        raise ValueError("password must be at most 72 bytes")
    return value


Password = Annotated[str, Field(min_length=8, max_length=72), AfterValidator(_within_bcrypt_limit)]

# Only these two roles may be self-registered. event_admin is granted per event through a
# StaffAssignment, and platform_admin is seeded internally.
SelfServiceRole = Literal[UserRole.attendee, UserRole.organizer]


class RegisterRequest(BaseModel):
    email: EmailStr
    password: Password
    full_name: str = Field(min_length=1, max_length=255)
    role: SelfServiceRole = UserRole.attendee


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: Literal["bearer"] = "bearer"
    expires_in: int


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class VerifyEmailRequest(BaseModel):
    token: str


class EmailRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirm(BaseModel):
    token: str
    new_password: Password


class MessageResponse(BaseModel):
    detail: str
