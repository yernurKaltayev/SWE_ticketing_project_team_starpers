"""P6 payments: add the 'halyk' payment provider (Halyk ePay test environment).

Revision ID: p6_halyk_provider
Revises: p11_event_soft_delete
Create Date: 2026-11-27
"""

from collections.abc import Sequence

from alembic import op

revision: str = "p6_halyk_provider"
down_revision: str | None = "p11_event_soft_delete"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ADD VALUE must be committed before the value is used, so run it outside the transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE payment_provider ADD VALUE IF NOT EXISTS 'halyk'")


def downgrade() -> None:
    # Postgres cannot drop an enum value. Payments rows keep history, so refuse rather than lose it.
    op.execute(
        "DO $$ BEGIN IF EXISTS (SELECT 1 FROM payments WHERE provider = 'halyk') THEN "
        "RAISE EXCEPTION 'halyk payments exist; cannot downgrade'; END IF; END $$"
    )
    op.execute("ALTER TYPE payment_provider RENAME TO payment_provider_old")
    op.execute("CREATE TYPE payment_provider AS ENUM ('sandbox')")
    op.execute(
        "ALTER TABLE payments ALTER COLUMN provider TYPE payment_provider "
        "USING provider::text::payment_provider"
    )
    op.execute("DROP TYPE payment_provider_old")
