"""P1: volunteer check-in accounts (user_role 'volunteer', users.deleted_at).

Revision ID: p1_volunteer_accounts
Revises: p1_phone_verification
Create Date: 2026-11-26
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p1_volunteer_accounts"
down_revision: str | None = "p1_phone_verification"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Allowed inside a transaction since PostgreSQL 12, as long as nothing here uses the value.
    op.execute("ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'volunteer'")
    op.add_column("users", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "deleted_at")
    # PostgreSQL cannot drop an enum value; 'volunteer' stays in user_role (unused).
