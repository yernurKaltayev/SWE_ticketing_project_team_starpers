# P5 Orders & Free Registration — integration notes

## Data model and transactions

P5 reuses the existing `orders`, `order_items`, `attendees`, `seat_holds`, and
`seat_hold_groups` tables. **No Alembic migration is necessary** for this patch.
All money is calculated on the server in integer tiyn (1 KZT = 100 tiyn).
No payment or card details are collected by the P5 API.

The `Idempotency-Key` header is scoped to the authenticated user and is stored
as `v1:<scope-hash>:<body-hash>` in the existing unique `orders.idempotency_key`
column. Replays with an identical cart return the original order; using the
same key for a different cart returns HTTP 409.

## Checkout flow

- **General admission:** `POST /api/v1/orders` with `event_id`, `items`,
  `attendees`, and optional `Idempotency-Key`. P3 atomically reserves quantities.
- **Assigned seating:** first `POST /api/v1/events/{event_id}/holds` using P4,
  then pass the P4 hold group ID in `hold_ids` and the same seat IDs under each
  order item (`seat_ids`). P5 validates that every seat belongs to the caller's
  active group(s); **it does not reserve that inventory a second time**.
- **Free:** zero-total order transitions to `free_confirmed` immediately,
  confirms P3/P4 inventory, and issues P8 tickets in the transaction.
- **Paid:** positive-total order stays `pending` with a ten-minute expiry (or
  the earliest seat-hold expiry). Tickets are not issued until P6 confirms a
  simulated payment.
- **Expiration and cancellation:** pending reservations return available P3
  quantities and release any still-held P4 seats. Already-expired P4 groups
  must not decrement P3 quantities again. Free cancellation revokes tickets,
  restores capacity, and releases assigned seating.

### Free GA example

```
POST /api/v1/orders
Authorization: Bearer <your-jwt>
Idempotency-Key: registration-abc-123
Content-Type: application/json

{
  "event_id": "<event UUID>",
  "items": [{"ticket_type_id": "<free-ticket UUID>", "quantity": 1}],
  "attendees": [{"full_name": "Example Attendee", "email": "guest@example.org"}]
}
```

### Assigned-seat example

```
POST /api/v1/orders
Authorization: Bearer <your-jwt>
Idempotency-Key: seat-checkout-abc-123
Content-Type: application/json

{
  "event_id": "<event UUID>",
  "items": [{
    "ticket_type_id": "<ticket UUID>",
    "quantity": 1,
    "seat_ids": ["<seat UUID>"]
  }],
  "hold_ids": ["<hold UUID returned by P4>"],
  "attendees": [{"full_name": "Example Attendee", "email": "guest@example.org"}]
}
```

## P6 handoff (owner: Dima)

The P6 signed/simulated payment handler must verify the provider result and
record its payment event **before** invoking either P5 hook, in the same DB
transaction:

```python
# ONLY after a trusted successful sandbox payment callback:
order = await order_service.confirm_paid_order(db, payment.order_id)
await db.commit()

# Or on trusted failure:
order = await order_service.fail_pending_order(db, payment.order_id)
await db.commit()
```

These hooks intentionally do **not** commit. The success hook is idempotent
(avoids duplicate tickets) and fails closed for expired, failed or cancelled
orders. On a payment success that arrives after a hold expiry, P6 must handle
void/refund in its sandbox provider rather than issue tickets.

## External dependencies still outstanding

- **P6:** payment intents, provider callback/signature, fee configuration,
  actual activation workflow, and gateway-failure notifications.
- **P16:** promo code discounts and atomic redemption. For now nonempty
  `promo_code` is rejected with `promo_unavailable` instead of silently ignoring
  it; fees and discounts default to zero, so `total == subtotal`.
- **P9:** `notify()` is presently a logging stub on master. P5 invokes it for
  free registration and P8 ticket delivery, but **no email is sent** until
  P9 lands.
- **P7:** paid-order refunds and related policy enforcement are owned by P7.
  P5 cancellation only covers pending orders and confirmed free registrations.

## Testing

With PostgreSQL and the project dev dependencies running:

```
uv run pytest tests/p5 -q
uv run pytest -q
uv run ruff check .
uv run ruff format --check .
```

P5 tests cover free checkout, ticket issuance, idempotent retries, replay
conflicts, free cancellation/CSV, role protection, paid pending/confirmation,
failure, expiry, and converting an existing assigned-seat hold.
