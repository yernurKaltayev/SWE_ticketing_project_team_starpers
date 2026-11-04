"""Declarative base, shared column types and mixins."""

import enum
import uuid
from datetime import UTC, datetime
from typing import Annotated, Any

from sqlalchemy import (
    CHAR,
    BigInteger,
    DateTime,
    Enum,
    ForeignKey,
    MetaData,
    Text,
    false,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, MappedColumn, mapped_column

from app.core.money import DEFAULT_CURRENCY

NAMING_CONVENTION = {
    "ix": "ix_%(table_name)s_%(column_0_N_name)s",
    "uq": "uq_%(table_name)s_%(column_0_N_name)s",
    "ck": "ck_%(table_name)s_%(constraint_name)s",
    "fk": "fk_%(table_name)s_%(column_0_name)s_%(referred_table_name)s",
    "pk": "pk_%(table_name)s",
}


class Base(DeclarativeBase):
    metadata = MetaData(naming_convention=NAMING_CONVENTION)
    type_annotation_map = {  # noqa: RUF012 - SQLAlchemy reads this as a plain class attribute
        uuid.UUID: PG_UUID(as_uuid=True),
        datetime: DateTime(timezone=True),
        str: Text,
        dict[str, Any]: JSONB,
    }


# Column shorthands. Money amounts are bigint tiyn: see app/core/money.py.
MoneyAmount = Annotated[int, mapped_column(BigInteger)]
ZeroMoney = Annotated[int, mapped_column(BigInteger, default=0, server_default="0")]
Counter = Annotated[int, mapped_column(default=0, server_default="0")]
FalseByDefault = Annotated[bool, mapped_column(default=False, server_default=false())]
TrueByDefault = Annotated[bool, mapped_column(default=True, server_default=text("true"))]
JsonObject = Annotated[dict[str, Any], mapped_column(default=dict, server_default=text("'{}'"))]


def utcnow() -> datetime:
    return datetime.now(UTC)


def pg_enum(enum_class: type[enum.Enum], name: str) -> Enum:
    """Native PostgreSQL enum that stores the member *values*."""
    return Enum(
        enum_class,
        name=name,
        values_callable=lambda members: [member.value for member in members],
    )


def fk(target: str, *, use_alter: bool = False, **kwargs: Any) -> MappedColumn[Any]:
    """Indexed foreign key. Nullability comes from the `Mapped[...]` annotation.

    No ON DELETE action: history must survive, so rows that are referenced cannot be
    removed. Deactivate them with a status field instead.
    """
    kwargs.setdefault("index", True)
    return mapped_column(ForeignKey(target, use_alter=use_alter), **kwargs)


class UUIDPrimaryKey:
    id: Mapped[uuid.UUID] = mapped_column(
        primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()")
    )


class Timestamps:
    created_at: Mapped[datetime] = mapped_column(default=utcnow, server_default=func.now())
    # Set in Python rather than by the DB: a server-side value would expire the attribute
    # after each flush, and reloading it implicitly is an error on an async session.
    updated_at: Mapped[datetime] = mapped_column(
        default=utcnow, onupdate=utcnow, server_default=func.now()
    )


class Currency:
    currency: Mapped[str] = mapped_column(
        CHAR(3), default=DEFAULT_CURRENCY, server_default=DEFAULT_CURRENCY
    )
