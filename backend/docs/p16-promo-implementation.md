# P16 Promo Codes & Campaign QR — integration notes

## Organizer API (event owner, platform admin, or manager staff)

- `POST /events/{id}/campaigns` — creates a campaign and one system-generated code
  (8 chars, no 0/O/1/I/L). `ticket_type_ids: []` means every ticket type of the event.
- `GET /events/{id}/campaigns`, `GET/PATCH /campaigns/{id}` — `PATCH {"is_enabled": false}`
  disables the code at once. `max_redemptions` cannot drop below slots already taken (409).
- `GET /campaigns/{id}/qr` — PNG of the **Campaign QR**.
- `GET /campaigns/{id}/report` — `redemptions` (slots taken, incl. pending checkouts) and, over
  completed orders only (`paid`, `free_confirmed`): `orders`, `tickets_sold`, `gross_revenue`,
  `discount`, `net_revenue` (tiyn).

Creation and disabling are audit-logged (`promo.created`, `promo.updated`, `promo.disabled`).

## Discount rules (server-side only)

- `percent`: whole percent (1–100) of every applicable ticket line, rounded half-up to the tiyn.
- `fixed`: tiyn off the **order once**, capped at the applicable lines' subtotal.
- A 100 % discount turns the order into a free registration (`free_confirmed`, tickets at once).

## Checkout (P5)

`POST /orders` with `promo_code`:
1. The code is validated and the discount computed from stored prices before anything is reserved.
2. After the order row exists, one slot is claimed with an atomic
   `UPDATE ... SET redemptions_count = redemptions_count + 1 WHERE redemptions_count < max_redemptions
   AND enabled AND within dates`, in the order transaction. A `promo_redemptions` row links the order.
3. `orders.discount_amount`, `orders.total` and `orders.promo_code_id` are set.

Rejections are 422 with code `promo_not_found` (unknown, or belongs to another event),
`promo_disabled`, `promo_not_started`, `promo_expired`, `promo_exhausted` or `promo_not_applicable`.

Failed, expired and cancelled orders release their slot (`release_inventory` and free
cancellation call `promo_service.release_promo`); the redemption becomes `released`.

## Public endpoints

- `POST /promo/validate` — `{event_id, code, ticket_type_ids}` (one entry per ticket) →
  `{valid, discount_amount, reason}`. Never errors for a bad code; `reason` holds the code above.
- `GET /c/{token}` (site root, not `/api/v1`) — what the Campaign QR encodes:
  `{PUBLIC_BASE_URL}/c/<opaque token>`. No price, discount or code is in the QR. Redirects (302) to
  `{WEB_BASE_URL}/events/{event_id}?promo=CODE`, or `?promo_status=<reason>` if the code is not
  usable now. Unlisted/private events also get `share=<share_token>`. Unknown token → 404.

## For P15 (check-in)

`promo_service.is_campaign_link(payload)` is true for Campaign QR payloads. Ticket QR payloads start
with `BFT1.` (P8), so check-in should reject Campaign QR codes with a clear `not_a_ticket` result.

## For P13 (analytics)

`campaign_report()` aggregates the same way and can be reused per campaign.
