"""P11 admin: add the 'suspended' event status.

Revision ID: p11_event_suspended
Revises: p9_notifications
Create Date: 2026-11-15
"""

from collections.abc import Sequence

from alembic import op

revision: str = "p11_event_suspended"
down_revision: str | None = "p9_notifications"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # ADD VALUE must be committed before the value is used, so run it outside the transaction.
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE event_status ADD VALUE IF NOT EXISTS 'suspended'")


def downgrade() -> None:
    # Postgres cannot drop an enum value, so rebuild the type. Suspended events go back to draft.
    op.execute("UPDATE events SET status = 'draft' WHERE status = 'suspended'")
    op.execute("ALTER TYPE event_status RENAME TO event_status_old")
    op.execute("CREATE TYPE event_status AS ENUM ('draft', 'published', 'cancelled')")
    op.execute("ALTER TABLE events ALTER COLUMN status DROP DEFAULT")
    op.execute(
        "ALTER TABLE events ALTER COLUMN status TYPE event_status "
        "USING status::text::event_status"
    )
    op.execute("ALTER TABLE events ALTER COLUMN status SET DEFAULT 'draft'")
    op.execute("DROP TYPE event_status_old")
