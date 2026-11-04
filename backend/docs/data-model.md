# Data model

The schema is defined by `app/models/` and created by `alembic/versions/p0_baseline.py`. The field
list is Appendix B of `/CLAUDE.md`. This file records the conventions and every place the
implementation had to settle something the plan left open or stated in two ways.

## Conventions

- `id` is a UUID, generated in Python and by `gen_random_uuid()` for raw SQL.
- `created_at` and `updated_at` are timestamptz.
- Money is `bigint` tiyn plus `currency char(3)`, default `KZT`.
- Enums are native PostgreSQL enums. Add a value with `ALTER TYPE ... ADD VALUE` in a migration;
  autogenerate does not detect it.
- Every foreign key is indexed and has no `ON DELETE` action: referenced history cannot be deleted.
- Constraint names follow the naming convention in `app/db/base.py`.

## Integrity enforced by the database

| Rule | Constraint |
|---|---|
| One active hold per seat | `uq_seat_holds_event_seat_active` |
| A seat is sold once | `uq_tickets_event_seat_active` |
| One live check-in per ticket | `uq_checkin_records_ticket_active` |
| No overselling | `ck_ticket_types_not_oversold` |
| No over-redemption | `ck_promotional_campaigns_not_over_redeemed` |
| One payment per provider reference | `uq_payments_provider_provider_ref` |
| One redemption per order | `uq_promo_redemptions_order_id` |
| One activation per event | `uq_paid_sales_activations_event_id` |

`tests/api/test_schema.py` covers these.

## Decisions on points the plan left open

| Topic | Decision | Reason |
|---|---|---|
| Entity count | 32 tables | The plan says 24 entities but lists 25. Appendix B adds token, layout, payout, activation, settings and report tables. Appendix B was followed. |
| `organizer_staff` role | Not a value of `users.role` | P1 lists it as a role, Appendix B does not. Staff are ordinary users with a `staff_assignments` row, which is per event. |
| `partially_refunded` | Included in `order_status` | In Appendix B, not in P5. Refunds are full-only for now (P7). |
| Seat hold index | `WHERE status = 'held'` | P4 also mentions `'sold'`; Appendix B moves sold seats to the `tickets` index. |
| `orders.expires_at` | Nullable | Free orders confirm immediately and have nothing to expire. |
| `orders.idempotency_key` | Required | As in Appendix B. P5 should generate one when the client sends no header. |
| `orders.is_simulated` | Defaults to true | A record that fails to set it must not look like real money. |
| `currency` | On every monetary table | Appendix B lists it on three tables, its conventions and P0 say every monetary record. |
| `seat_holds` owner | `session_id` and `user_id`, at least one set | Appendix B says `session_id/user_id`. Allows guest checkout later. |
| Seat numbers | Integers | Predefined layouts are numbered. Row labels hold letters. |
| `audit_logs.entity_id` | Text | `platform_settings` is keyed by name, not UUID. |
| `audit_logs` timestamps | `occurred_at` only | An append-only table has no updates to record. |
| `audit_logs.metadata` | Attribute is `AuditLog.meta` | `metadata` is reserved by SQLAlchemy. The column keeps its name. |
| `payments` / `paid_sales_activations` | Circular foreign keys | The FK from activations to payments is added after both tables exist. |

## Left for later parts

- Revoking UPDATE/DELETE on `audit_logs` at DB level (P12).
- Encrypting `payout_accounts.iban_encrypted` (P6).
- Query-specific indexes such as event search (P2) and hold expiry (P4).
