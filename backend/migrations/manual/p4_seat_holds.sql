-- P4 additive PostgreSQL prototype. Convert into a proper Alembic revision before merging.
-- IMPORTANT: Reconcile the existing app/models/seat_hold.py / 'seat_holds' table first.
-- Do not run this SQL on production, or with any competing seat-reservation writer.
BEGIN;
CREATE TABLE IF NOT EXISTS p4_hold_groups (
    id uuid PRIMARY KEY,
    event_id uuid NOT NULL,
    user_id uuid NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('held', 'released', 'expired', 'sold')),
    expires_at timestamptz NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_p4_hold_groups_event_expires
    ON p4_hold_groups (event_id, expires_at) WHERE status = 'held';
CREATE TABLE IF NOT EXISTS p4_hold_seats (
    id uuid PRIMARY KEY,
    hold_id uuid NOT NULL REFERENCES p4_hold_groups (id) ON DELETE RESTRICT,
    event_id uuid NOT NULL,
    seat_id uuid NOT NULL,
    ticket_type_id uuid NOT NULL,
    status varchar(16) NOT NULL CHECK (status IN ('held', 'released', 'expired', 'sold')),
    UNIQUE (hold_id, seat_id)
);
-- The partial unique index is a LAST LINE OF DEFENSE. Application code must expire
-- stale 'held' rows in a transaction before attempting to claim these seats.
-- Sold rows remain unique forever unless an authorized refund flow releases them.
CREATE UNIQUE INDEX IF NOT EXISTS uq_p4_event_seat_held_or_sold
    ON p4_hold_seats (event_id, seat_id)
    WHERE status IN ('held', 'sold');
CREATE INDEX IF NOT EXISTS ix_p4_hold_seats_hold_id ON p4_hold_seats (hold_id);
COMMIT;
