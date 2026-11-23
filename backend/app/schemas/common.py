"""Base classes shared by all request/response schemas."""

import re
from typing import Annotated, Any

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

Name = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
Phone = Annotated[str, StringConstraints(strip_whitespace=True, max_length=32)]


def _kazakhstan_phone(value: str) -> str:
    """Accept the ways people type a Kazakhstan number and store one format: +77012345678.

    "+7 701 234 56 78", "+7 (701) 234-56-78", "87012345678", "77012345678" and "7012345678"
    are the same number. Kazakhstan numbers are +7 6xx or +7 7xx; other +7 ranges are Russia.
    """
    digits = re.sub(r"[\s().-]", "", value).removeprefix("+")
    if not digits.isdigit():
        raise ValueError("Enter a Kazakhstan phone number, e.g. +7 701 234 56 78.")
    if len(digits) == 11 and digits[0] in "78":
        digits = digits[1:]
    if len(digits) != 10 or digits[0] not in "67":
        raise ValueError("Enter a Kazakhstan phone number, e.g. +7 701 234 56 78.")
    return f"+7{digits}"


KazakhstanPhone = Annotated[
    str, StringConstraints(max_length=32), AfterValidator(_kazakhstan_phone)
]


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
