"""p3 update ticket inventory constraints

Revision ID: 41cd110ed2f3
Revises: p0_baseline
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op


revision: str = '41cd110ed2f3'
down_revision: str | None = 'p0_baseline'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None





def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_ticket_types_not_oversold"),
        "ticket_types",
        type_="check",
    )

    op.create_check_constraint(
        op.f("ck_ticket_types_not_oversold"),
        "ticket_types",
        "qty_reserved + qty_sold - qty_refunded <= quantity_total",
    )

    op.create_check_constraint(
        op.f("ck_ticket_types_refunds_not_above_sales"),
        "ticket_types",
        "qty_refunded <= qty_sold",
    )

    op.create_check_constraint(
        op.f("ck_ticket_types_checkins_and_refunds_valid"),
        "ticket_types",
        "qty_checked_in + qty_refunded <= qty_sold",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_ticket_types_checkins_and_refunds_valid"),
        "ticket_types",
        type_="check",
    )

    op.drop_constraint(
        op.f("ck_ticket_types_refunds_not_above_sales"),
        "ticket_types",
        type_="check",
    )

    op.drop_constraint(
        op.f("ck_ticket_types_not_oversold"),
        "ticket_types",
        type_="check",
    )

    op.create_check_constraint(
        op.f("ck_ticket_types_not_oversold"),
        "ticket_types",
        "qty_reserved + qty_sold <= quantity_total",
    )
