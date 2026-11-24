"""P1: Telegram phone verification (users.phone_verified_at, users.telegram_chat_id,
phone_verifications).

Revision ID: p1_phone_verification
Revises: p12_audit_append_only
Create Date: 2026-11-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "p1_phone_verification"
down_revision: str | None = "p12_audit_append_only"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_verified_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("users", sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True))
    op.create_table(
        "phone_verifications",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.Text(), nullable=False),
        sa.Column("telegram_chat_id", sa.BigInteger(), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", sa.UUID(), server_default=sa.text("gen_random_uuid()"), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_phone_verifications_user_id_users")
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_phone_verifications")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_phone_verifications_token_hash")),
    )
    op.create_index(
        op.f("ix_phone_verifications_user_id"), "phone_verifications", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_phone_verifications_user_id"), table_name="phone_verifications")
    op.drop_table("phone_verifications")
    op.drop_column("users", "telegram_chat_id")
    op.drop_column("users", "phone_verified_at")
