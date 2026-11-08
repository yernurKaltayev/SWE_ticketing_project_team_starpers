# P7 Cancellations & Refunds — integration notes

Refunds are **full** and **simulated** (sandbox provider). `partially_refunded` is never produced.

## Endpoints

- `PUT /events/{id}/refund-policy` — `{summary, refundable_until?}` (owner, manager staff, admin).
  Returned as `refund_policy` on `EventOut`, including the public event detail, so attendees see it.
  The policy is informational: organizers decide refunds; event cancellation always refunds.
- `POST /orders/{id}/refund` — `{reason}`; owner, **manager** staff or platform admin only.
  - `paid` → provider refund, `Refund(status=completed)`, order `refunded`, every ticket
    `refunded` immediately (check-in rejects it), unused inventory back on sale (`qty_refunded`),
    assigned seats released, audit `refund.completed`, `refund_completed` notification.
  - Retry on an already refunded order returns the same refund (no second payout).
  - `free_confirmed` → 409 `free_order_use_cancel` (use P5 `POST /orders/{id}/cancel`).
  - other states → 409 `order_not_refundable`; a checked-in ticket → 409 `already_checked_in`.
  - provider refusal → 409 `refund_failed`, everything rolled back, tickets stay valid.
- `GET /events/{id}/refunds` — paginated list for the event.

## Event cancellation (P2 `POST /events/{id}/cancel`)

Previously blocked when the event had orders. It now settles every order in the same transaction
(`refund_service.cancel_event_orders`): pending checkouts released, free registrations cancelled,
paid orders fully refunded (checked-in tickets too: the event did not take place). Each buyer gets
an `event_cancelled` notification. Paid sales are disabled. Promo slots of cancelled/released
orders are returned (P16).

## Money

`GET /events/{id}/financials` (P6) and payouts subtract completed refunds. The processing fee is
not returned to the organizer on refund (sandbox policy; open decision).
