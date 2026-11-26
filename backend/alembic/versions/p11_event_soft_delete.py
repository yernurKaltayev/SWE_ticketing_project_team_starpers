"""P11: admins soft-delete events (events.deleted_at).

Revision ID: p11_event_soft_delete
Revises: p1_volunteer_accounts
Create Date: 2026-11-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p11_event_soft_delete"
down_revision: str | None = "p1_volunteer_accounts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("events", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "deleted_at")
