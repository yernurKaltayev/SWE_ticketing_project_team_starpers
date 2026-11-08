# P15 Ticket Verification & Check-In — integration notes

Online only (no offline sync). Access everywhere: event owner, platform admin, or staff assigned
to the event with the `checkin` role (managers included). Support staff cannot scan.

## `POST /checkin/verify` `{event_id, qr_payload}`

Always 200 with `{result, ticket, message}` so the scanner can show a clear instruction:

| result | when | ticket |
|---|---|---|
| `accepted` | valid ticket, now checked in | yes |
| `already_used` | checked in before | yes |
| `refunded` | order refunded (P7) | yes |
| `invalid` | forged/garbled `BFT1.` payload, unknown ticket, or cancelled ticket | cancelled only |
| `wrong_event` | genuine ticket for another event | no (not disclosed) |
| `not_a_ticket` | Campaign QR (`https://…/c/<token>`, P16) or anything without the `BFT1.` prefix | no |

Check-in is one atomic `UPDATE tickets SET status='checked_in' WHERE id=:id AND status='valid'`;
concurrent scans of one ticket admit it exactly once (tested with five parallel transactions). A
`checkin_records` row is written, `ticket_types.qty_checked_in` is incremented and the action is
audited (`checkin.accepted`).

## `POST /checkin/{ticket_id}/undo` `{reason}`

Reverts an accidental check-in: ticket back to `valid`, the record marked `reverted` with
who/when/why, counter decremented, audit `checkin.reverted`. 409 `not_checked_in` otherwise.
The ticket can then be scanned again.

## `GET /events/{event_id}/checkin/stats`

`registered` = tickets `valid` or `checked_in`; `checked_in` = tickets `checked_in`.
The attendee list with ticket status is P5's `GET /events/{id}/attendees?status=…` (check-in
staff have access).
