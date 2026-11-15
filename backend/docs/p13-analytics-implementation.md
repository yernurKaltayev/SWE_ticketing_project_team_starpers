# P13 – Organizer analytics

Owner: Yernur. Contract: `docs/openapi.yaml` (`analytics` tag). Service:
`app/services/analytics_service.py`.

## Endpoint

`GET /events/{event_id}/analytics?date_from&date_to&ticket_type_id`

- **Access:** event owner, manager staff, platform admin (`require_event_access(StaffRole.manager)`).
  Other organizers, check-in and support staff get 403. Works for every event status.
- **Read-only:** a few aggregate queries, no writes, no locks, so checkout is never slowed. A test
  asserts no rows change. Data comes from orders, tickets, refunds and promo rows, never GA4.

## Definitions

| Field | Meaning |
|---|---|
| sale orders | `paid`, `free_confirmed`, `refunded`, `partially_refunded`. Pending, failed, expired, cancelled are not sales |
| sold | tickets that are `valid` or `checked_in` now (net of refunds and cancellations), counted from `tickets` rows, not the `qty_*` counters (those can drift when checked-in tickets are revoked on event cancel) |
| remaining | `capacity - sold - reserved`, floor 0 (`reserved` = `qty_reserved`, so held inventory is not shown as free) |
| percent_sold | `sold / capacity * 100`, one decimal, 0 if capacity is 0 |
| gross | sum of line totals (list price before discount) of sale orders |
| discounts | promo discounts on those orders |
| refunds | completed refunds on those orders |
| net | `gross - discounts - refunds`. The processing fee is a payout deduction (P6) and is not part of these |
| sales_over_time | one point per day (tickets, revenue after discount), zero-filled, days in the **event time zone**, by order creation time (orders have no `paid_at`). Default span: first sale to today, max 366 days |
| by_ticket_type | current sold per type; revenue = line totals minus that line's discount share |
| campaigns | applied redemptions on sale orders: order count and `subtotal - discount`. Matches `promo_service.campaign_report`, except `redemptions` counts sale orders, not `redemptions_count` (which includes pending checkouts) |
| checked_in / absent / checkin_percent | checked-in tickets; `sold - checked_in`; ratio of the two. A reverted check-in is not counted |

**Filters.** `date_from` is inclusive and `date_to` exclusive (reversed range is 422
`invalid_date_range`). They filter money, the series and campaigns; inventory and check-in figures
are the current state. `ticket_type_id` (404 `ticket_type_not_found` if it is not this event's)
limits every figure to that type; order-level discounts and refunds are split by the type's share
of the order subtotal, rounded half-up, so filtered figures add up to the unfiltered ones.

## Performance

Per-event row counts are small and `orders.event_id` is indexed, so no new index or materialized view
was added. If an event grows large, add `(event_id, status, created_at)` on `orders`.

## Tests

`tests/api/test_analytics_p13.py`: access rules, empty event, mixed scene totals, ticket-type filter
splitting, foreign ticket type, time zone and zero-fill, date bounds, campaigns, check-in numbers,
read-only guarantee, agreement with the payout summary, rounding helpers.
