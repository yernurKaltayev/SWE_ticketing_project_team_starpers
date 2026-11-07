"""p4 canonical grouped seat holds

Revision ID: 0d4a70b4c1a2
Revises: 41cd110ed2f3

Add group membership and ticket-type accounting to existing seat_holds;
do NOT create a second p4_hold_seats seat ledger.

Precondition: review/resolve any old converted+held duplicates before migrating.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision: str = "0d4a70b4c1a2"
down_revision: str | None = "41cd110ed2f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "seat_hold_groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "event_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("events.id"), nullable=False
        ),
        sa.Column(
            "user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False
        ),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.CheckConstraint(
            "status IN ('held', 'released', 'expired', 'sold')", name="ck_seat_hold_groups_status"
        ),
    )
    op.create_index("ix_seat_hold_groups_event_id", "seat_hold_groups", ["event_id"])
    op.create_index("ix_seat_hold_groups_user_id", "seat_hold_groups", ["user_id"])
    op.create_index(
        "ix_seat_hold_groups_event_expires",
        "seat_hold_groups",
        ["event_id", "expires_at"],
        postgresql_where=sa.text("status = 'held'"),
    )
    # Nullable for backward compatibility with P0 rows.
    op.add_column(
        "seat_holds", sa.Column("hold_group_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.add_column(
        "seat_holds", sa.Column("ticket_type_id", postgresql.UUID(as_uuid=True), nullable=True)
    )
    op.create_foreign_key(
        "fk_seat_holds_hold_group_id_seat_hold_groups",
        "seat_holds",
        "seat_hold_groups",
        ["hold_group_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_seat_holds_ticket_type_id_ticket_types",
        "seat_holds",
        "ticket_types",
        ["ticket_type_id"],
        ["id"],
    )
    op.create_index("ix_seat_holds_hold_group_id", "seat_holds", ["hold_group_id"])
    op.create_index("ix_seat_holds_ticket_type_id", "seat_holds", ["ticket_type_id"])
    op.create_unique_constraint(
        "uq_seat_holds_group_seat", "seat_holds", ["hold_group_id", "seat_id"]
    )
    op.create_check_constraint(
        "ck_seat_holds_group_requires_ticket_type",
        "seat_holds",
        "hold_group_id IS NULL OR ticket_type_id IS NOT NULL",
    )
    # P0's unqualified Mapped[datetime] is timestamp WITHOUT time zone.
    # The project must confirm existing naive values represent UTC before upgrade.
    op.alter_column(
        "seat_holds",
        "expires_at",
        existing_type=sa.DateTime(timezone=False),
        type_=sa.DateTime(timezone=True),
        postgresql_using="expires_at AT TIME ZONE 'UTC'",
    )
    # Existing index protects held rows, not converted/sold rows. Replace it.
    op.drop_index("uq_seat_holds_event_seat_active", table_name="seat_holds")
    op.create_index(
        "uq_seat_holds_event_seat_active",
        "seat_holds",
        ["event_id", "seat_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('held', 'converted')"),
    )


def downgrade() -> None:
    # Destructive for grouped P4 data. Export/backup before downgrading.
    op.alter_column(
        "seat_holds",
        "expires_at",
        existing_type=sa.DateTime(timezone=True),
        type_=sa.DateTime(timezone=False),
        postgresql_using="expires_at AT TIME ZONE 'UTC'",
    )
    op.drop_index("uq_seat_holds_event_seat_active", table_name="seat_holds")
    op.create_index(
        "uq_seat_holds_event_seat_active",
        "seat_holds",
        ["event_id", "seat_id"],
        unique=True,
        postgresql_where=sa.text("status = 'held'"),
    )
    op.drop_constraint("ck_seat_holds_group_requires_ticket_type", "seat_holds", type_="check")
    op.drop_constraint("uq_seat_holds_group_seat", "seat_holds", type_="unique")
    op.drop_index("ix_seat_holds_hold_group_id", table_name="seat_holds")
    op.drop_constraint(
        "fk_seat_holds_ticket_type_id_ticket_types", "seat_holds", type_="foreignkey"
    )
    op.drop_constraint(
        "fk_seat_holds_hold_group_id_seat_hold_groups", "seat_holds", type_="foreignkey"
    )
    op.drop_index("ix_seat_holds_ticket_type_id", table_name="seat_holds")
    op.drop_column("seat_holds", "ticket_type_id")
    op.drop_column("seat_holds", "hold_group_id")
    op.drop_index("ix_seat_hold_groups_event_expires", table_name="seat_hold_groups")
    op.drop_index("ix_seat_hold_groups_user_id", table_name="seat_hold_groups")
    op.drop_index("ix_seat_hold_groups_event_id", table_name="seat_hold_groups")
    op.drop_table("seat_hold_groups")
