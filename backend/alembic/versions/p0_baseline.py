"""p0_baseline: schema v1, all tables from CLAUDE.md Appendix B.

Revision ID: p0_baseline
Revises: 
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = 'p0_baseline'
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ACTIVATION_PAYMENT_FK = 'fk_paid_sales_activations_activation_payment_id_payments'
ENUM_TYPES = (
    'activation_status',
    'checkin_result',
    'discount_type',
    'email_status',
    'email_token_purpose',
    'event_report_status',
    'event_status',
    'event_visibility',
    'notification_type',
    'order_status',
    'paid_sales_status',
    'payment_kind',
    'payment_provider',
    'payment_status',
    'payout_status',
    'promo_redemption_status',
    'refund_status',
    'seat_hold_status',
    'seating_mode',
    'staff_role',
    'support_audience',
    'support_category',
    'support_status',
    'ticket_status',
    'user_role',
    'verification_status',
)


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS citext")

    op.create_table('users',
    sa.Column('email', postgresql.CITEXT(), nullable=False),
    sa.Column('password_hash', sa.Text(), nullable=False),
    sa.Column('full_name', sa.Text(), nullable=False),
    sa.Column('phone', sa.Text(), nullable=True),
    sa.Column('role', sa.Enum('attendee', 'organizer', 'platform_admin', name='user_role'), server_default='attendee', nullable=False),
    sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_suspended', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('last_login_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_users')),
    sa.UniqueConstraint('email', name=op.f('uq_users_email'))
    )
    op.create_table('venues',
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('address', sa.Text(), nullable=False),
    sa.Column('city', sa.Text(), nullable=False),
    sa.Column('lat', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('lng', sa.Numeric(precision=9, scale=6), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_venues'))
    )
    op.create_index(op.f('ix_venues_city'), 'venues', ['city'], unique=False)
    op.create_table('email_tokens',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('purpose', sa.Enum('verify', 'reset', name='email_token_purpose'), nullable=False),
    sa.Column('token_hash', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_email_tokens_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_email_tokens')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_email_tokens_token_hash'))
    )
    op.create_index(op.f('ix_email_tokens_user_id'), 'email_tokens', ['user_id'], unique=False)
    op.create_table('notifications',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('type', sa.Enum('account_verification', 'purchase_confirmation', 'payment_failed', 'ticket_delivery', 'event_update', 'event_cancelled', 'refund_completed', 'payout_status', 'support_message', 'support_assigned', 'support_status', name='notification_type'), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('payload', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'"), nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('email_status', sa.Enum('pending', 'sent', 'failed', name='email_status'), server_default='pending', nullable=False),
    sa.Column('email_attempts', sa.Integer(), server_default='0', nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_notifications_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_notifications'))
    )
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_table('organizer_profiles',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('organization_name', sa.Text(), nullable=False),
    sa.Column('contact_email', sa.Text(), nullable=False),
    sa.Column('contact_phone', sa.Text(), nullable=False),
    sa.Column('verification_status', sa.Enum('unverified', 'pending', 'verified', 'rejected', name='verification_status'), server_default='unverified', nullable=False),
    sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_organizer_profiles_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_organizer_profiles')),
    sa.UniqueConstraint('user_id', name=op.f('uq_organizer_profiles_user_id'))
    )
    op.create_table('platform_settings',
    sa.Column('key', sa.Text(), nullable=False),
    sa.Column('value', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('updated_by', sa.UUID(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['updated_by'], ['users.id'], name=op.f('fk_platform_settings_updated_by_users')),
    sa.PrimaryKeyConstraint('key', name=op.f('pk_platform_settings'))
    )
    op.create_index(op.f('ix_platform_settings_updated_by'), 'platform_settings', ['updated_by'], unique=False)
    op.create_table('refresh_tokens',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_refresh_tokens_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refresh_tokens')),
    sa.UniqueConstraint('token_hash', name=op.f('uq_refresh_tokens_token_hash'))
    )
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_table('venue_layouts',
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], name=op.f('fk_venue_layouts_venue_id_venues')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_venue_layouts'))
    )
    op.create_index(op.f('ix_venue_layouts_venue_id'), 'venue_layouts', ['venue_id'], unique=False)
    op.create_table('events',
    sa.Column('organizer_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.Text(), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('category', sa.Text(), nullable=False),
    sa.Column('image_urls', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'"), nullable=False),
    sa.Column('venue_id', sa.UUID(), nullable=False),
    sa.Column('layout_id', sa.UUID(), nullable=True),
    sa.Column('starts_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('ends_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('timezone', sa.Text(), nullable=False),
    sa.Column('visibility', sa.Enum('public', 'unlisted', 'private', name='event_visibility'), server_default='public', nullable=False),
    sa.Column('share_token', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('draft', 'published', 'cancelled', name='event_status'), server_default='draft', nullable=False),
    sa.Column('seating_mode', sa.Enum('general_admission', 'assigned', name='seating_mode'), server_default='general_admission', nullable=False),
    sa.Column('capacity', sa.Integer(), nullable=False),
    sa.Column('registration_opens_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('registration_closes_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('paid_sales_status', sa.Enum('disabled', 'active', 'suspended', name='paid_sales_status'), server_default='disabled', nullable=False),
    sa.Column('refund_policy', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'"), nullable=False),
    sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('duplicated_from_id', sa.UUID(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['duplicated_from_id'], ['events.id'], name=op.f('fk_events_duplicated_from_id_events')),
    sa.ForeignKeyConstraint(['layout_id'], ['venue_layouts.id'], name=op.f('fk_events_layout_id_venue_layouts')),
    sa.ForeignKeyConstraint(['organizer_id'], ['organizer_profiles.id'], name=op.f('fk_events_organizer_id_organizer_profiles')),
    sa.ForeignKeyConstraint(['venue_id'], ['venues.id'], name=op.f('fk_events_venue_id_venues')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_events')),
    sa.UniqueConstraint('share_token', name=op.f('uq_events_share_token'))
    )
    op.create_index(op.f('ix_events_duplicated_from_id'), 'events', ['duplicated_from_id'], unique=False)
    op.create_index(op.f('ix_events_layout_id'), 'events', ['layout_id'], unique=False)
    op.create_index(op.f('ix_events_organizer_id'), 'events', ['organizer_id'], unique=False)
    op.create_index(op.f('ix_events_venue_id'), 'events', ['venue_id'], unique=False)
    op.create_table('payout_accounts',
    sa.Column('organizer_id', sa.UUID(), nullable=False),
    sa.Column('bank_name', sa.Text(), nullable=False),
    sa.Column('iban_encrypted', sa.Text(), nullable=False),
    sa.Column('holder_name', sa.Text(), nullable=False),
    sa.Column('is_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('is_simulated', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['organizer_id'], ['organizer_profiles.id'], name=op.f('fk_payout_accounts_organizer_id_organizer_profiles')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_payout_accounts'))
    )
    op.create_index(op.f('ix_payout_accounts_organizer_id'), 'payout_accounts', ['organizer_id'], unique=False)
    op.create_table('venue_sections',
    sa.Column('layout_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('price_category', sa.Text(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['layout_id'], ['venue_layouts.id'], name=op.f('fk_venue_sections_layout_id_venue_layouts')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_venue_sections'))
    )
    op.create_index(op.f('ix_venue_sections_layout_id'), 'venue_sections', ['layout_id'], unique=False)
    op.create_table('audit_logs',
    sa.Column('occurred_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('actor_id', sa.UUID(), nullable=True),
    sa.Column('actor_role', sa.Text(), nullable=False),
    sa.Column('action_type', sa.Text(), nullable=False),
    sa.Column('entity_type', sa.Text(), nullable=False),
    sa.Column('entity_id', sa.Text(), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=True),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('metadata', postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'"), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.ForeignKeyConstraint(['actor_id'], ['users.id'], name=op.f('fk_audit_logs_actor_id_users')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_audit_logs_event_id_events')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_audit_logs'))
    )
    op.create_index(op.f('ix_audit_logs_actor_id'), 'audit_logs', ['actor_id'], unique=False)
    op.create_index('ix_audit_logs_entity', 'audit_logs', ['entity_type', 'entity_id'], unique=False)
    op.create_index('ix_audit_logs_event_occurred', 'audit_logs', ['event_id', 'occurred_at'], unique=False)
    op.create_table('event_reports',
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('reporter_id', sa.UUID(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('open', 'reviewed', 'dismissed', 'actioned', name='event_report_status'), server_default='open', nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_event_reports_event_id_events')),
    sa.ForeignKeyConstraint(['reporter_id'], ['users.id'], name=op.f('fk_event_reports_reporter_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_event_reports'))
    )
    op.create_index(op.f('ix_event_reports_event_id'), 'event_reports', ['event_id'], unique=False)
    op.create_index(op.f('ix_event_reports_reporter_id'), 'event_reports', ['reporter_id'], unique=False)
    op.create_table('paid_sales_activations',
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('identity_verified', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('payout_account_id', sa.UUID(), nullable=True),
    sa.Column('activation_payment_id', sa.UUID(), nullable=True),
    sa.Column('terms_accepted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('status', sa.Enum('incomplete', 'active', 'suspended', name='activation_status'), server_default='incomplete', nullable=False),
    sa.Column('suspended_reason', sa.Text(), nullable=True),
    sa.Column('activated_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_paid_sales_activations_event_id_events')),
    sa.ForeignKeyConstraint(['payout_account_id'], ['payout_accounts.id'], name=op.f('fk_paid_sales_activations_payout_account_id_payout_accounts')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_paid_sales_activations')),
    sa.UniqueConstraint('event_id', name=op.f('uq_paid_sales_activations_event_id'))
    )
    op.create_index(op.f('ix_paid_sales_activations_activation_payment_id'), 'paid_sales_activations', ['activation_payment_id'], unique=False)
    op.create_index(op.f('ix_paid_sales_activations_payout_account_id'), 'paid_sales_activations', ['payout_account_id'], unique=False)
    op.create_table('payouts',
    sa.Column('organizer_id', sa.UUID(), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('gross', sa.BigInteger(), nullable=False),
    sa.Column('fees', sa.BigInteger(), nullable=False),
    sa.Column('refunds', sa.BigInteger(), nullable=False),
    sa.Column('net', sa.BigInteger(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'scheduled', 'paid', 'failed', name='payout_status'), server_default='pending', nullable=False),
    sa.Column('scheduled_for', sa.DateTime(timezone=True), nullable=True),
    sa.Column('paid_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_payouts_event_id_events')),
    sa.ForeignKeyConstraint(['organizer_id'], ['organizer_profiles.id'], name=op.f('fk_payouts_organizer_id_organizer_profiles')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_payouts'))
    )
    op.create_index(op.f('ix_payouts_event_id'), 'payouts', ['event_id'], unique=False)
    op.create_index(op.f('ix_payouts_organizer_id'), 'payouts', ['organizer_id'], unique=False)
    op.create_table('promotional_campaigns',
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('discount_type', sa.Enum('percent', 'fixed', name='discount_type'), nullable=False),
    sa.Column('discount_value', sa.BigInteger(), nullable=False),
    sa.Column('valid_from', sa.DateTime(timezone=True), nullable=False),
    sa.Column('valid_to', sa.DateTime(timezone=True), nullable=False),
    sa.Column('max_redemptions', sa.Integer(), nullable=False),
    sa.Column('redemptions_count', sa.Integer(), server_default='0', nullable=False),
    sa.Column('applicable_ticket_type_ids', postgresql.ARRAY(sa.UUID()), server_default=sa.text("'{}'"), nullable=False),
    sa.Column('is_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('qr_token', sa.Text(), nullable=False),
    sa.Column('qr_object_key', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.CheckConstraint('redemptions_count <= max_redemptions', name=op.f('ck_promotional_campaigns_not_over_redeemed')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_promotional_campaigns_event_id_events')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_promotional_campaigns')),
    sa.UniqueConstraint('qr_token', name=op.f('uq_promotional_campaigns_qr_token'))
    )
    op.create_index(op.f('ix_promotional_campaigns_event_id'), 'promotional_campaigns', ['event_id'], unique=False)
    op.create_table('staff_assignments',
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('role', sa.Enum('manager', 'checkin', 'support', name='staff_role'), nullable=False),
    sa.Column('assigned_by', sa.UUID(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['assigned_by'], ['users.id'], name=op.f('fk_staff_assignments_assigned_by_users')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_staff_assignments_event_id_events')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_staff_assignments_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_staff_assignments')),
    sa.UniqueConstraint('event_id', 'user_id', name=op.f('uq_staff_assignments_event_id_user_id'))
    )
    op.create_index(op.f('ix_staff_assignments_assigned_by'), 'staff_assignments', ['assigned_by'], unique=False)
    op.create_index(op.f('ix_staff_assignments_event_id'), 'staff_assignments', ['event_id'], unique=False)
    op.create_index(op.f('ix_staff_assignments_user_id'), 'staff_assignments', ['user_id'], unique=False)
    op.create_table('ticket_types',
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.Text(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('price_amount', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('quantity_total', sa.Integer(), nullable=False),
    sa.Column('is_free', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('sales_start', sa.DateTime(timezone=True), nullable=True),
    sa.Column('sales_end', sa.DateTime(timezone=True), nullable=True),
    sa.Column('max_per_order', sa.Integer(), server_default='10', nullable=False),
    sa.Column('is_hidden', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('price_category', sa.Text(), nullable=True),
    sa.Column('qty_reserved', sa.Integer(), server_default='0', nullable=False),
    sa.Column('qty_sold', sa.Integer(), server_default='0', nullable=False),
    sa.Column('qty_refunded', sa.Integer(), server_default='0', nullable=False),
    sa.Column('qty_checked_in', sa.Integer(), server_default='0', nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.CheckConstraint('qty_reserved + qty_sold <= quantity_total', name=op.f('ck_ticket_types_not_oversold')),
    sa.CheckConstraint('qty_reserved >= 0 AND qty_sold >= 0 AND qty_refunded >= 0 AND qty_checked_in >= 0', name=op.f('ck_ticket_types_counters_not_negative')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_ticket_types_event_id_events')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_ticket_types'))
    )
    op.create_index(op.f('ix_ticket_types_event_id'), 'ticket_types', ['event_id'], unique=False)
    op.create_table('venue_rows',
    sa.Column('section_id', sa.UUID(), nullable=False),
    sa.Column('label', sa.Text(), nullable=False),
    sa.Column('position', sa.Integer(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['section_id'], ['venue_sections.id'], name=op.f('fk_venue_rows_section_id_venue_sections')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_venue_rows'))
    )
    op.create_index(op.f('ix_venue_rows_section_id'), 'venue_rows', ['section_id'], unique=False)
    op.create_table('promo_codes',
    sa.Column('campaign_id', sa.UUID(), nullable=False),
    sa.Column('code', postgresql.CITEXT(), nullable=False),
    sa.Column('is_enabled', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['campaign_id'], ['promotional_campaigns.id'], name=op.f('fk_promo_codes_campaign_id_promotional_campaigns')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_promo_codes')),
    sa.UniqueConstraint('code', name=op.f('uq_promo_codes_code'))
    )
    op.create_index(op.f('ix_promo_codes_campaign_id'), 'promo_codes', ['campaign_id'], unique=False)
    op.create_table('seats',
    sa.Column('row_id', sa.UUID(), nullable=False),
    sa.Column('number', sa.Integer(), nullable=False),
    sa.Column('is_accessible', sa.Boolean(), server_default=sa.text('false'), nullable=False),
    sa.Column('price_category', sa.Text(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['row_id'], ['venue_rows.id'], name=op.f('fk_seats_row_id_venue_rows')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_seats')),
    sa.UniqueConstraint('row_id', 'number', name=op.f('uq_seats_row_id_number'))
    )
    op.create_index(op.f('ix_seats_row_id'), 'seats', ['row_id'], unique=False)
    op.create_table('orders',
    sa.Column('order_number', sa.Text(), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('buyer_user_id', sa.UUID(), nullable=True),
    sa.Column('buyer_email', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'paid', 'free_confirmed', 'failed', 'expired', 'cancelled', 'refunded', 'partially_refunded', name='order_status'), server_default='pending', nullable=False),
    sa.Column('subtotal', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('discount_amount', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('processing_fee', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('total', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('promo_code_id', sa.UUID(), nullable=True),
    sa.Column('idempotency_key', sa.Text(), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_simulated', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.ForeignKeyConstraint(['buyer_user_id'], ['users.id'], name=op.f('fk_orders_buyer_user_id_users')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_orders_event_id_events')),
    sa.ForeignKeyConstraint(['promo_code_id'], ['promo_codes.id'], name=op.f('fk_orders_promo_code_id_promo_codes')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_orders')),
    sa.UniqueConstraint('idempotency_key', name=op.f('uq_orders_idempotency_key')),
    sa.UniqueConstraint('order_number', name=op.f('uq_orders_order_number'))
    )
    op.create_index(op.f('ix_orders_buyer_user_id'), 'orders', ['buyer_user_id'], unique=False)
    op.create_index(op.f('ix_orders_event_id'), 'orders', ['event_id'], unique=False)
    op.create_index(op.f('ix_orders_promo_code_id'), 'orders', ['promo_code_id'], unique=False)
    op.create_table('order_items',
    sa.Column('order_id', sa.UUID(), nullable=False),
    sa.Column('ticket_type_id', sa.UUID(), nullable=False),
    sa.Column('seat_id', sa.UUID(), nullable=True),
    sa.Column('section_name', sa.Text(), nullable=True),
    sa.Column('row_label', sa.Text(), nullable=True),
    sa.Column('seat_number', sa.Integer(), nullable=True),
    sa.Column('unit_price', sa.BigInteger(), nullable=False),
    sa.Column('quantity', sa.Integer(), nullable=False),
    sa.Column('line_total', sa.BigInteger(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_order_items_order_id_orders')),
    sa.ForeignKeyConstraint(['seat_id'], ['seats.id'], name=op.f('fk_order_items_seat_id_seats')),
    sa.ForeignKeyConstraint(['ticket_type_id'], ['ticket_types.id'], name=op.f('fk_order_items_ticket_type_id_ticket_types')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_order_items'))
    )
    op.create_index(op.f('ix_order_items_order_id'), 'order_items', ['order_id'], unique=False)
    op.create_index(op.f('ix_order_items_seat_id'), 'order_items', ['seat_id'], unique=False)
    op.create_index(op.f('ix_order_items_ticket_type_id'), 'order_items', ['ticket_type_id'], unique=False)
    op.create_table('payments',
    sa.Column('order_id', sa.UUID(), nullable=True),
    sa.Column('activation_id', sa.UUID(), nullable=True),
    sa.Column('kind', sa.Enum('ticket', 'activation_fee', name='payment_kind'), nullable=False),
    sa.Column('provider', sa.Enum('sandbox', name='payment_provider'), nullable=False),
    sa.Column('provider_ref', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'succeeded', 'failed', 'cancelled', name='payment_status'), server_default='pending', nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('fee_amount', sa.BigInteger(), server_default='0', nullable=False),
    sa.Column('is_simulated', sa.Boolean(), server_default=sa.text('true'), nullable=False),
    sa.Column('failure_reason', sa.Text(), nullable=True),
    sa.Column('raw_event', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.CheckConstraint("(kind = 'ticket' AND order_id IS NOT NULL) OR (kind = 'activation_fee' AND activation_id IS NOT NULL)", name=op.f('ck_payments_kind_has_target')),
    sa.ForeignKeyConstraint(['activation_id'], ['paid_sales_activations.id'], name=op.f('fk_payments_activation_id_paid_sales_activations')),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_payments_order_id_orders')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_payments')),
    sa.UniqueConstraint('provider', 'provider_ref', name=op.f('uq_payments_provider_provider_ref'))
    )
    op.create_index(op.f('ix_payments_activation_id'), 'payments', ['activation_id'], unique=False)
    op.create_index(op.f('ix_payments_order_id'), 'payments', ['order_id'], unique=False)
    # payments and paid_sales_activations reference each other, so this one comes last.
    op.create_foreign_key(ACTIVATION_PAYMENT_FK, 'paid_sales_activations', 'payments', ['activation_payment_id'], ['id'])
    op.create_table('promo_redemptions',
    sa.Column('promo_code_id', sa.UUID(), nullable=False),
    sa.Column('campaign_id', sa.UUID(), nullable=False),
    sa.Column('order_id', sa.UUID(), nullable=False),
    sa.Column('discount_amount', sa.BigInteger(), nullable=False),
    sa.Column('status', sa.Enum('applied', 'released', name='promo_redemption_status'), server_default='applied', nullable=False),
    sa.Column('redeemed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.ForeignKeyConstraint(['campaign_id'], ['promotional_campaigns.id'], name=op.f('fk_promo_redemptions_campaign_id_promotional_campaigns')),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_promo_redemptions_order_id_orders')),
    sa.ForeignKeyConstraint(['promo_code_id'], ['promo_codes.id'], name=op.f('fk_promo_redemptions_promo_code_id_promo_codes')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_promo_redemptions')),
    sa.UniqueConstraint('order_id', name=op.f('uq_promo_redemptions_order_id'))
    )
    op.create_index(op.f('ix_promo_redemptions_campaign_id'), 'promo_redemptions', ['campaign_id'], unique=False)
    op.create_index(op.f('ix_promo_redemptions_promo_code_id'), 'promo_redemptions', ['promo_code_id'], unique=False)
    op.create_table('seat_holds',
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('seat_id', sa.UUID(), nullable=False),
    sa.Column('session_id', sa.Text(), nullable=True),
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('order_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.Enum('held', 'converted', 'released', 'expired', name='seat_hold_status'), server_default='held', nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.CheckConstraint('user_id IS NOT NULL OR session_id IS NOT NULL', name=op.f('ck_seat_holds_has_owner')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_seat_holds_event_id_events')),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_seat_holds_order_id_orders')),
    sa.ForeignKeyConstraint(['seat_id'], ['seats.id'], name=op.f('fk_seat_holds_seat_id_seats')),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], name=op.f('fk_seat_holds_user_id_users')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_seat_holds'))
    )
    op.create_index(op.f('ix_seat_holds_event_id'), 'seat_holds', ['event_id'], unique=False)
    op.create_index(op.f('ix_seat_holds_order_id'), 'seat_holds', ['order_id'], unique=False)
    op.create_index(op.f('ix_seat_holds_seat_id'), 'seat_holds', ['seat_id'], unique=False)
    op.create_index(op.f('ix_seat_holds_user_id'), 'seat_holds', ['user_id'], unique=False)
    op.create_index('uq_seat_holds_event_seat_active', 'seat_holds', ['event_id', 'seat_id'], unique=True, postgresql_where=sa.text("status = 'held'"))
    op.create_table('attendees',
    sa.Column('order_id', sa.UUID(), nullable=False),
    sa.Column('order_item_id', sa.UUID(), nullable=True),
    sa.Column('full_name', sa.Text(), nullable=False),
    sa.Column('email', sa.Text(), nullable=False),
    sa.Column('phone', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_attendees_order_id_orders')),
    sa.ForeignKeyConstraint(['order_item_id'], ['order_items.id'], name=op.f('fk_attendees_order_item_id_order_items')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_attendees'))
    )
    op.create_index(op.f('ix_attendees_order_id'), 'attendees', ['order_id'], unique=False)
    op.create_index(op.f('ix_attendees_order_item_id'), 'attendees', ['order_item_id'], unique=False)
    op.create_table('refunds',
    sa.Column('order_id', sa.UUID(), nullable=False),
    sa.Column('payment_id', sa.UUID(), nullable=False),
    sa.Column('amount', sa.BigInteger(), nullable=False),
    sa.Column('reason', sa.Text(), nullable=False),
    sa.Column('initiated_by', sa.UUID(), nullable=False),
    sa.Column('status', sa.Enum('pending', 'completed', 'failed', name='refund_status'), server_default='pending', nullable=False),
    sa.Column('provider_ref', sa.Text(), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('currency', sa.CHAR(length=3), server_default='KZT', nullable=False),
    sa.ForeignKeyConstraint(['initiated_by'], ['users.id'], name=op.f('fk_refunds_initiated_by_users')),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_refunds_order_id_orders')),
    sa.ForeignKeyConstraint(['payment_id'], ['payments.id'], name=op.f('fk_refunds_payment_id_payments')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_refunds'))
    )
    op.create_index(op.f('ix_refunds_initiated_by'), 'refunds', ['initiated_by'], unique=False)
    op.create_index(op.f('ix_refunds_order_id'), 'refunds', ['order_id'], unique=False)
    op.create_index(op.f('ix_refunds_payment_id'), 'refunds', ['payment_id'], unique=False)
    op.create_table('tickets',
    sa.Column('ticket_number', sa.Text(), nullable=False),
    sa.Column('order_item_id', sa.UUID(), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('ticket_type_id', sa.UUID(), nullable=False),
    sa.Column('attendee_id', sa.UUID(), nullable=False),
    sa.Column('seat_id', sa.UUID(), nullable=True),
    sa.Column('section_name', sa.Text(), nullable=True),
    sa.Column('row_label', sa.Text(), nullable=True),
    sa.Column('seat_number', sa.Integer(), nullable=True),
    sa.Column('qr_token', sa.Text(), nullable=False),
    sa.Column('status', sa.Enum('valid', 'checked_in', 'cancelled', 'refunded', name='ticket_status'), server_default='valid', nullable=False),
    sa.Column('issued_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('pdf_object_key', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['attendee_id'], ['attendees.id'], name=op.f('fk_tickets_attendee_id_attendees')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_tickets_event_id_events')),
    sa.ForeignKeyConstraint(['order_item_id'], ['order_items.id'], name=op.f('fk_tickets_order_item_id_order_items')),
    sa.ForeignKeyConstraint(['seat_id'], ['seats.id'], name=op.f('fk_tickets_seat_id_seats')),
    sa.ForeignKeyConstraint(['ticket_type_id'], ['ticket_types.id'], name=op.f('fk_tickets_ticket_type_id_ticket_types')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_tickets')),
    sa.UniqueConstraint('qr_token', name=op.f('uq_tickets_qr_token')),
    sa.UniqueConstraint('ticket_number', name=op.f('uq_tickets_ticket_number'))
    )
    op.create_index(op.f('ix_tickets_attendee_id'), 'tickets', ['attendee_id'], unique=False)
    op.create_index(op.f('ix_tickets_event_id'), 'tickets', ['event_id'], unique=False)
    op.create_index(op.f('ix_tickets_order_item_id'), 'tickets', ['order_item_id'], unique=False)
    op.create_index(op.f('ix_tickets_seat_id'), 'tickets', ['seat_id'], unique=False)
    op.create_index(op.f('ix_tickets_ticket_type_id'), 'tickets', ['ticket_type_id'], unique=False)
    op.create_index('uq_tickets_event_seat_active', 'tickets', ['event_id', 'seat_id'], unique=True, postgresql_where=sa.text("status IN ('valid', 'checked_in')"))
    op.create_table('checkin_records',
    sa.Column('ticket_id', sa.UUID(), nullable=False),
    sa.Column('event_id', sa.UUID(), nullable=False),
    sa.Column('staff_user_id', sa.UUID(), nullable=False),
    sa.Column('checked_in_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('reverted_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('reverted_by', sa.UUID(), nullable=True),
    sa.Column('revert_reason', sa.Text(), nullable=True),
    sa.Column('result', sa.Enum('accepted', 'reverted', name='checkin_result'), server_default='accepted', nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_checkin_records_event_id_events')),
    sa.ForeignKeyConstraint(['reverted_by'], ['users.id'], name=op.f('fk_checkin_records_reverted_by_users')),
    sa.ForeignKeyConstraint(['staff_user_id'], ['users.id'], name=op.f('fk_checkin_records_staff_user_id_users')),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], name=op.f('fk_checkin_records_ticket_id_tickets')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_checkin_records'))
    )
    op.create_index(op.f('ix_checkin_records_event_id'), 'checkin_records', ['event_id'], unique=False)
    op.create_index(op.f('ix_checkin_records_reverted_by'), 'checkin_records', ['reverted_by'], unique=False)
    op.create_index(op.f('ix_checkin_records_staff_user_id'), 'checkin_records', ['staff_user_id'], unique=False)
    op.create_index(op.f('ix_checkin_records_ticket_id'), 'checkin_records', ['ticket_id'], unique=False)
    op.create_index('uq_checkin_records_ticket_active', 'checkin_records', ['ticket_id'], unique=True, postgresql_where=sa.text('reverted_at IS NULL'))
    op.create_table('support_cases',
    sa.Column('requester_id', sa.UUID(), nullable=False),
    sa.Column('audience', sa.Enum('attendee_case', 'organizer_case', name='support_audience'), nullable=False),
    sa.Column('category', sa.Enum('ticket_delivery', 'payment', 'refund', 'seating', 'event_info', 'check_in', 'account', 'technical', name='support_category'), nullable=False),
    sa.Column('status', sa.Enum('open', 'in_progress', 'waiting_customer', 'resolved', name='support_status'), server_default='open', nullable=False),
    sa.Column('assignee_id', sa.UUID(), nullable=True),
    sa.Column('event_id', sa.UUID(), nullable=True),
    sa.Column('order_id', sa.UUID(), nullable=True),
    sa.Column('ticket_id', sa.UUID(), nullable=True),
    sa.Column('subject', sa.Text(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['assignee_id'], ['users.id'], name=op.f('fk_support_cases_assignee_id_users')),
    sa.ForeignKeyConstraint(['event_id'], ['events.id'], name=op.f('fk_support_cases_event_id_events')),
    sa.ForeignKeyConstraint(['order_id'], ['orders.id'], name=op.f('fk_support_cases_order_id_orders')),
    sa.ForeignKeyConstraint(['requester_id'], ['users.id'], name=op.f('fk_support_cases_requester_id_users')),
    sa.ForeignKeyConstraint(['ticket_id'], ['tickets.id'], name=op.f('fk_support_cases_ticket_id_tickets')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_support_cases'))
    )
    op.create_index(op.f('ix_support_cases_assignee_id'), 'support_cases', ['assignee_id'], unique=False)
    op.create_index(op.f('ix_support_cases_event_id'), 'support_cases', ['event_id'], unique=False)
    op.create_index(op.f('ix_support_cases_order_id'), 'support_cases', ['order_id'], unique=False)
    op.create_index(op.f('ix_support_cases_requester_id'), 'support_cases', ['requester_id'], unique=False)
    op.create_index(op.f('ix_support_cases_ticket_id'), 'support_cases', ['ticket_id'], unique=False)
    op.create_table('support_messages',
    sa.Column('case_id', sa.UUID(), nullable=False),
    sa.Column('author_id', sa.UUID(), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('id', sa.UUID(), server_default=sa.text('gen_random_uuid()'), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['author_id'], ['users.id'], name=op.f('fk_support_messages_author_id_users')),
    sa.ForeignKeyConstraint(['case_id'], ['support_cases.id'], name=op.f('fk_support_messages_case_id_support_cases')),
    sa.PrimaryKeyConstraint('id', name=op.f('pk_support_messages'))
    )
    op.create_index(op.f('ix_support_messages_author_id'), 'support_messages', ['author_id'], unique=False)
    op.create_index('ix_support_messages_case_created', 'support_messages', ['case_id', 'created_at'], unique=False)


def downgrade() -> None:
    op.drop_constraint(ACTIVATION_PAYMENT_FK, 'paid_sales_activations', type_='foreignkey')
    op.drop_index('ix_support_messages_case_created', table_name='support_messages')
    op.drop_index(op.f('ix_support_messages_author_id'), table_name='support_messages')
    op.drop_table('support_messages')
    op.drop_index(op.f('ix_support_cases_ticket_id'), table_name='support_cases')
    op.drop_index(op.f('ix_support_cases_requester_id'), table_name='support_cases')
    op.drop_index(op.f('ix_support_cases_order_id'), table_name='support_cases')
    op.drop_index(op.f('ix_support_cases_event_id'), table_name='support_cases')
    op.drop_index(op.f('ix_support_cases_assignee_id'), table_name='support_cases')
    op.drop_table('support_cases')
    op.drop_index('uq_checkin_records_ticket_active', table_name='checkin_records', postgresql_where=sa.text('reverted_at IS NULL'))
    op.drop_index(op.f('ix_checkin_records_ticket_id'), table_name='checkin_records')
    op.drop_index(op.f('ix_checkin_records_staff_user_id'), table_name='checkin_records')
    op.drop_index(op.f('ix_checkin_records_reverted_by'), table_name='checkin_records')
    op.drop_index(op.f('ix_checkin_records_event_id'), table_name='checkin_records')
    op.drop_table('checkin_records')
    op.drop_index('uq_tickets_event_seat_active', table_name='tickets', postgresql_where=sa.text("status IN ('valid', 'checked_in')"))
    op.drop_index(op.f('ix_tickets_ticket_type_id'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_seat_id'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_order_item_id'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_event_id'), table_name='tickets')
    op.drop_index(op.f('ix_tickets_attendee_id'), table_name='tickets')
    op.drop_table('tickets')
    op.drop_index(op.f('ix_refunds_payment_id'), table_name='refunds')
    op.drop_index(op.f('ix_refunds_order_id'), table_name='refunds')
    op.drop_index(op.f('ix_refunds_initiated_by'), table_name='refunds')
    op.drop_table('refunds')
    op.drop_index(op.f('ix_attendees_order_item_id'), table_name='attendees')
    op.drop_index(op.f('ix_attendees_order_id'), table_name='attendees')
    op.drop_table('attendees')
    op.drop_index('uq_seat_holds_event_seat_active', table_name='seat_holds', postgresql_where=sa.text("status = 'held'"))
    op.drop_index(op.f('ix_seat_holds_user_id'), table_name='seat_holds')
    op.drop_index(op.f('ix_seat_holds_seat_id'), table_name='seat_holds')
    op.drop_index(op.f('ix_seat_holds_order_id'), table_name='seat_holds')
    op.drop_index(op.f('ix_seat_holds_event_id'), table_name='seat_holds')
    op.drop_table('seat_holds')
    op.drop_index(op.f('ix_promo_redemptions_promo_code_id'), table_name='promo_redemptions')
    op.drop_index(op.f('ix_promo_redemptions_campaign_id'), table_name='promo_redemptions')
    op.drop_table('promo_redemptions')
    op.drop_index(op.f('ix_payments_order_id'), table_name='payments')
    op.drop_index(op.f('ix_payments_activation_id'), table_name='payments')
    op.drop_table('payments')
    op.drop_index(op.f('ix_order_items_ticket_type_id'), table_name='order_items')
    op.drop_index(op.f('ix_order_items_seat_id'), table_name='order_items')
    op.drop_index(op.f('ix_order_items_order_id'), table_name='order_items')
    op.drop_table('order_items')
    op.drop_index(op.f('ix_orders_promo_code_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_event_id'), table_name='orders')
    op.drop_index(op.f('ix_orders_buyer_user_id'), table_name='orders')
    op.drop_table('orders')
    op.drop_index(op.f('ix_seats_row_id'), table_name='seats')
    op.drop_table('seats')
    op.drop_index(op.f('ix_promo_codes_campaign_id'), table_name='promo_codes')
    op.drop_table('promo_codes')
    op.drop_index(op.f('ix_venue_rows_section_id'), table_name='venue_rows')
    op.drop_table('venue_rows')
    op.drop_index(op.f('ix_ticket_types_event_id'), table_name='ticket_types')
    op.drop_table('ticket_types')
    op.drop_index(op.f('ix_staff_assignments_user_id'), table_name='staff_assignments')
    op.drop_index(op.f('ix_staff_assignments_event_id'), table_name='staff_assignments')
    op.drop_index(op.f('ix_staff_assignments_assigned_by'), table_name='staff_assignments')
    op.drop_table('staff_assignments')
    op.drop_index(op.f('ix_promotional_campaigns_event_id'), table_name='promotional_campaigns')
    op.drop_table('promotional_campaigns')
    op.drop_index(op.f('ix_payouts_organizer_id'), table_name='payouts')
    op.drop_index(op.f('ix_payouts_event_id'), table_name='payouts')
    op.drop_table('payouts')
    op.drop_index(op.f('ix_paid_sales_activations_payout_account_id'), table_name='paid_sales_activations')
    op.drop_index(op.f('ix_paid_sales_activations_activation_payment_id'), table_name='paid_sales_activations')
    op.drop_table('paid_sales_activations')
    op.drop_index(op.f('ix_event_reports_reporter_id'), table_name='event_reports')
    op.drop_index(op.f('ix_event_reports_event_id'), table_name='event_reports')
    op.drop_table('event_reports')
    op.drop_index('ix_audit_logs_event_occurred', table_name='audit_logs')
    op.drop_index('ix_audit_logs_entity', table_name='audit_logs')
    op.drop_index(op.f('ix_audit_logs_actor_id'), table_name='audit_logs')
    op.drop_table('audit_logs')
    op.drop_index(op.f('ix_venue_sections_layout_id'), table_name='venue_sections')
    op.drop_table('venue_sections')
    op.drop_index(op.f('ix_payout_accounts_organizer_id'), table_name='payout_accounts')
    op.drop_table('payout_accounts')
    op.drop_index(op.f('ix_events_venue_id'), table_name='events')
    op.drop_index(op.f('ix_events_organizer_id'), table_name='events')
    op.drop_index(op.f('ix_events_layout_id'), table_name='events')
    op.drop_index(op.f('ix_events_duplicated_from_id'), table_name='events')
    op.drop_table('events')
    op.drop_index(op.f('ix_venue_layouts_venue_id'), table_name='venue_layouts')
    op.drop_table('venue_layouts')
    op.drop_index(op.f('ix_refresh_tokens_user_id'), table_name='refresh_tokens')
    op.drop_table('refresh_tokens')
    op.drop_index(op.f('ix_platform_settings_updated_by'), table_name='platform_settings')
    op.drop_table('platform_settings')
    op.drop_table('organizer_profiles')
    op.drop_index(op.f('ix_notifications_user_id'), table_name='notifications')
    op.drop_table('notifications')
    op.drop_index(op.f('ix_email_tokens_user_id'), table_name='email_tokens')
    op.drop_table('email_tokens')
    op.drop_index(op.f('ix_venues_city'), table_name='venues')
    op.drop_table('venues')
    op.drop_table('users')
    for enum_type in ENUM_TYPES:
        op.execute(f'DROP TYPE {enum_type}')
