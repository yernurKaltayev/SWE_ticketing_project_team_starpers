import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class OrganizerProfileUpsert(BaseModel):
    display_name: str = Field(min_length=1, max_length=255)
    contact_email: EmailStr
    contact_phone: str | None = Field(default=None, max_length=32)
    description: str | None = None


class OrganizerProfileRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    display_name: str
    contact_email: str
    contact_phone: str | None
    description: str | None
    is_identity_verified: bool
    created_at: datetime
