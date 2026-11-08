# P6 Payments, Paid-Sales Activation & Payouts — integration notes

Everything here is a **simulation** (`is_simulated: true`). No card data is accepted or stored.

## Paid checkout (attendee)

1. `POST /orders` (P5) creates a `pending` order and reserves inventory.
2. `POST /orders/{order_id}/payments` opens a sandbox intent. Calling it again while the
   payment is pending returns the same payment (safe retry). Only the buyer may call it.
3. The web app shows `checkout_url` (a DEMO/SIMULATED page, never a card form) and then calls
   `POST /payments/{payment_id}/simulate` with `{"outcome": "succeeded"}` or
   `{"outcome": "failed", "failure_reason": "..."}`.
4. Poll `GET /payments/{payment_id}` / `GET /orders/{order_id}` for the final status.

`/simulate` does not shortcut anything: it builds the provider's HMAC-signed webhook and runs
it through the same code as `POST /payments/webhooks/sandbox` (header `X-Sandbox-Signature`).

### Webhook rules

- Signature is verified first (bad/missing → 422 `invalid_webhook`).
- The payment row is locked; only a `pending` payment changes. Duplicate deliveries are no-ops,
  so a repeated success never issues a second ticket set.
- Success → `order_service.confirm_paid_order` (tickets issued, inventory confirmed).
- Failure → `order_service.fail_pending_order` (inventory released, `payment_failed` notification).
- Success for an order that can no longer be fulfilled (reservation expired, cancelled) is
  **voided** at the provider: payment `cancelled`, reason `order_no_longer_payable_voided`,
  reservation released, no tickets.

## Fees

- Processing fee: `processing_fee_percent` (default 3 %) of each ticket payment, stored in
  `payments.fee_amount` and **deducted from the organizer** — the buyer's total never changes
  (SRS: no per-ticket service fee). `orders.processing_fee` stays 0.
- Activation fee: `activation_fee_amount` (default 1 000 000 tiyn = 10 000 KZT) per event.
- Both, plus `payout_delay_days`, can be overridden by `platform_settings` rows (P11).

## Paid-sales activation (organizer, per event)

`GET /events/{id}/activation` returns `missing_steps` from:
`paid_ticket_type`, `identity_verification`, `payout_account`, `activation_fee`, `terms`.

- `POST /events/{id}/activation/verify-identity` — simulated check, always passes.
- `POST /organizers/me/payout-accounts` — IBAN checksum-validated, encrypted at rest
  (Fernet key derived from `TICKET_SIGNING_SECRET`), only `iban_last4` is returned.
- `PATCH /events/{id}/activation` — `{"payout_account_id": ..., "accept_terms": true}`.
- `POST /events/{id}/activation/pay` → then `/payments/{id}/simulate`.

When the last step completes, the activation becomes `active` and `events.paid_sales_status`
becomes `active` **for that event only**.

### For P11 (admin)

`app.services.payments.activation.suspend_paid_sales(db, event, reason, actor)` and
`resume_paid_sales(db, event, actor)` (caller commits). Suspension blocks new orders (P3/P5
gate) and new payment intents.

## Payouts

- `GET /events/{id}/financials` — gross, fees, completed refunds (P7), estimated payout.
- Worker job `payouts_job` (hourly): for finished, non-cancelled events with sales it creates one
  `scheduled` payout (`scheduled_for = ends_at + payout_delay_days`), then marks due payouts
  `paid` and sends a `payout_status` notification. Idempotent.
- `GET /organizers/me/payouts` — paginated list.

## For P7 (refunds)

Use `get_provider(payment.provider).refund(provider_ref, Money(...))` for the provider call and
write a `Refund` row with status `completed`; financials and payouts already subtract them.
