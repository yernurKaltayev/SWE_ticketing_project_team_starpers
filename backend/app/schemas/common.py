"""Base classes shared by all request/response schemas."""

from typing import Any

from pydantic import BaseModel, ConfigDict


class OrmModel(BaseModel):
    """For response schemas built from ORM objects."""

    model_config = ConfigDict(from_attributes=True)


class ErrorOut(BaseModel):
    """Body of every non-2xx response."""

    code: str
    message: str
    details: Any = None


class MessageOut(BaseModel):
    message: str
