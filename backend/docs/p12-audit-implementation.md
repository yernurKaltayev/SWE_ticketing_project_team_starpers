# P12 – Audit log and event history

Owner: Yernur. Contract: `docs/openapi.yaml` (`history` tag).

## Endpoint

`GET /events/{event_id}/history` (`app/routers/history.py`)

- **Access:** event owner, manager staff and platform admins (`require_event_access(StaffRole.manager)`).
  Check-in and support staff get 403 `event_access_denied`.
- **No status guard:** completed, cancelled and suspended events stay readable.
- **Filters:** `date_from` (inclusive), `date_to` (exclusive; a reversed range is 422
  `invalid_date_range`), `action_type` (exact name), `category` (see below; unknown is 422
  `unknown_category`), plus `limit` / `offset`. Newest first.
- **Response:** `HistoryOut { event_status, lifecycle, items[], total, limit, offset }`. Each item
  is an `AuditEntryOut`; its extra data is in `metadata`.
- Read-only. There are no update or delete routes, and the table rejects them (below).

## Lifecycle

`app/services/event_lifecycle.py::classify(status, starts_at, ends_at, now)`, derived and never
stored: `cancelled` if the event is cancelled, else `completed` once `now >= ends_at`, `active`
from `starts_at` until `ends_at`, otherwise `upcoming`. Drafts and suspended events are classified
by date; `event_status` carries the stored status.

## Categories

Stored action names are not uniform (`event_published`, `order.paid`), so the filter uses
`app/services/audit_categories.py`: exact names (`NAMES`) plus dotted prefixes (`PREFIXES`).

| Category | Covers |
|---|---|
| event | `event_*` lifecycle actions, `event.suspended/resumed` |
| ticket_type | `ticket_type_created/updated` |
| staff | `staff_assigned/removed` |
| order | `order.*`, `tickets.*` |
| payment | `payment.*`, `payout.*`, `payout_account.*` |
| refund | `refund.*`, `refund_policy.updated` |
| promo, support, checkin, paid_sales | `<name>.*` |
| admin | `event_report.*`, `user.*`, `settings.*` |

`tests/unit/test_audit_categories.py` scans `app/` for `action_type=` literals and fails if one
belongs to no category. **To add an audit action:** call `audit(...)` with `event_id` (so it shows in
history), then add the name to the table above's source file.

## Append-only

Migration `p12_audit_append_only` adds triggers that raise on `UPDATE`, `DELETE` and `TRUNCATE` of
`audit_logs`. Triggers apply to every role, including the table owner, which a `REVOKE` would not
(the dev and test role owns the table). Inserts are unaffected. The only way to remove rows is to
disable the trigger as the table owner (`tests/api/test_checkin_p15.py` does this for its own
cleanup). A separate least-privilege app role with `REVOKE` can be added on top for production.

## What `audit()` guarantees

- Adds the row to the caller's transaction, so it commits or rolls back with the change.
- `metadata` must be JSON-serializable: `audit()` raises `TypeError` immediately instead of failing
  at flush time (stringify UUIDs, use `model_dump(mode="json")`).
- Do not put secrets or personal data in `metadata` or `description`: organizer staff can read them.
- `ticket_type_updated` records `changes.price_amount` / `changes.quantity_total` as
  `{from, to}`; `event_updated` records `capacity_from` / `capacity_to`.

## Tests

`tests/api/test_history_p12.py` (access rules, isolation, ordering, pagination, filters, lifecycle
for each state, end-to-end publish/update/cancel flow, trigger rejects UPDATE/DELETE/TRUNCATE),
`tests/unit/test_event_lifecycle.py`, `tests/unit/test_audit_categories.py`.
