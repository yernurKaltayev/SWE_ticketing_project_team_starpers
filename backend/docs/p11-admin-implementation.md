# P11 – Platform administration

Owner: Yernur. Contract: `docs/openapi.yaml` (`admin` tag). Every `/admin/*` route needs the
`platform_admin` role (router-level dependency in `app/routers/admin.py`); logic lives in
`app/services/admin_service.py`.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /admin/users`, `/events`, `/orders`, `/payments` | Paginated search (`q`, `status`, date range; users also `role`, `suspended`) |
| `POST /admin/users/{id}/suspend` | Suspend or reinstate. Revokes refresh tokens; the access token is rejected by `get_current_user`. Admins cannot suspend themselves or other admins |
| `POST /admin/events/{id}/suspend` | Event becomes `suspended`: hidden from public views, no holds, no orders. Active paid sales are suspended with it. Existing orders and tickets are untouched. The organizer gets an `event_update` notification |
| `POST /admin/events/{id}/paid-sales/suspend` | Suspend or restore paid sales only, via `suspend_paid_sales` / `resume_paid_sales` (P6) |
| `GET /admin/refunds`, `/activations` | Monitors. Payment failures are `GET /admin/payments?status=failed` |
| `GET /admin/disputes` | Derived queue (no dispute table): failed refunds plus unresolved payment/refund support cases |
| `GET /admin/support/cases` | Escalated cases: organizer cases (handled by the platform, P10) that are not resolved |
| `GET /admin/campaigns` | Promo activity: redemptions applied and discount given per campaign |
| `GET /admin/reports`, `PATCH /admin/reports/{id}` | Reported events: list, mark reviewed / dismissed / actioned |
| `POST /events/{id}/reports` | Any signed-in user reports a published, non-private event |
| `GET`/`PATCH /admin/settings` | Effective platform settings; partial update, all-or-nothing |
| `GET /admin/exports/{report}.csv` | `orders`, `payments`, `refunds`, `users`, `events`; max 10 000 rows; optional `created_from` / `created_to` |

## Settings

Stored in `platform_settings`; a missing row falls back to the env default (`app/core/config.py`).

| Key | Rule | Default |
|---|---|---|
| `activation_fee_amount` | whole tiyn, >= 1 | 1 000 000 |
| `processing_fee_percent` | number 0–100 | 3 |
| `payout_delay_days` | whole number >= 0 | 3 |
| `hold_minutes` | whole number >= 1 | 10 |

`hold_minutes` replaces the hardcoded hold length: `fees.hold_duration(db)` is used for seat holds
(`seat_service`) and the expiry of GA orders (`order_service`). Holds that already exist keep their
original expiry. `HOLD_DURATION` in `hold_policy_p4.py` remains as the pure-rule default.
Unknown keys and invalid values return 422 (`unknown_setting`, `invalid_setting`) and save nothing.

## Event suspension

`EventStatus.suspended` is a new enum value (migration `p11_event_suspended`; the downgrade rebuilds
the type and turns suspended events back into drafts). Only `published` events can be suspended and
only `suspended` events can be reinstated. Public lists, event details, availability, seat maps and
order creation already required `published`, so no other code needed to change. Cancelling or
refunding a suspended event is a separate organizer or admin action.

## Audit and CSV

State changes write `audit()` entries in the same transaction: `user.suspended|resumed`,
`event.suspended|resumed`, `paid_sales.suspended` (P6), `settings.updated` (before/after values),
`event_report.created|reviewed|dismissed|actioned`.

CSV cells that start with `=`, `+`, `-`, `@`, tab or CR are prefixed with `'` so spreadsheets do not
run them as formulas. Real numbers are written as-is.

## Tests

`tests/api/test_admin_p11.py`: role guards on every route, search and pagination, user and event
suspension (including session revocation and public visibility), paid-sales-only suspension, reports,
settings validation and propagation, monitors, CSV escaping. `tests/api/test_contract.py` checks that
every route is declared in the contract.
