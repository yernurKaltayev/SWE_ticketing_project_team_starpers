"""P9 notifications: indexes for the email worker and the /me/notifications list.

Revision ID: p9_notifications
Revises: 0d4a70b4c1a2
Create Date: 2026-11-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p9_notifications"
down_revision: str | None = "0d4a70b4c1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # The worker scans only pending rows, oldest first; the partial index stays small.
    op.create_index(
        "ix_notifications_email_pending",
        "notifications",
        ["created_at"],
        postgresql_where=sa.text("email_status = 'pending'"),
    )
    op.create_index(
        "ix_notifications_user_id_created_at", "notifications", ["user_id", "created_at"]
    )


def downgrade() -> None:
    op.drop_index("ix_notifications_user_id_created_at", table_name="notifications")
    op.drop_index("ix_notifications_email_pending", table_name="notifications")
