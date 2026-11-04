"""Base classes shared by all request/response schemas."""

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=32)]


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
