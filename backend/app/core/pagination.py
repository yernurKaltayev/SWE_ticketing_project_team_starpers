"""Limit/offset pagination shared by all list endpoints."""

from dataclasses import dataclass
from typing import Annotated, Any

from fastapi import Depends, Query
from pydantic import BaseModel
from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession

MAX_PAGE_SIZE = 100


class Page[T](BaseModel):
    items: list[T]
    total: int
    limit: int
    offset: int


@dataclass(frozen=True)
class PageParams:
    limit: int = Query(20, ge=1, le=MAX_PAGE_SIZE)
    offset: int = Query(0, ge=0)


Pagination = Annotated[PageParams, Depends()]


async def paginate(db: AsyncSession, stmt: Select[Any], params: PageParams) -> Page[Any]:
    """Run `stmt` for one page. Give `stmt` an ORDER BY or pages are not stable.

    Rows are returned as ORM objects when `stmt` selects a single entity. The endpoint's
    `response_model` converts them to the output schema.
    """
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    rows = await db.scalars(stmt.limit(params.limit).offset(params.offset))
    return Page(items=list(rows), total=total or 0, limit=params.limit, offset=params.offset)
