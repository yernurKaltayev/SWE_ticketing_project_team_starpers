# F0 wireframes

Owner: **Yernur Slyamshaikhov**, sole F0 owner.

[Open the editable Figma file](https://www.figma.com/design/MSh77BTh5A82lmOsxCZnGb/BiletFlow-F0-Wireframes?node-id=0-1).

Created on 4 November 2026 for structure and behavior review. This university-account copy supersedes the original Gmail-account file for ongoing work. Owner approval remains pending; creation does not complete all F0 acceptance gates.

## Review

Read **START HERE** and **Open a review flow** on the canvas. In Present, choose Attendee, Organizer, Platform Admin, Event Admin mobile, Compact web or Recovery states. Prototype links illustrate representative paths; forms, payments, QR blocks and downloads do not call an API or perform real operations.

| Frames | Coverage |
|---|---|
| A1–A8 | Discovery, event detail, account return, general-admission quantity, simulated paid checkout, free checkout, confirmation, owned ticket |
| O1–O8 | Event list, draft editor, ticket setup, per-event paid activation, preview/publish, attendees/staff, analytics/campaign QR |
| D1–D5 | Event search, moderation details, suspension confirmation/result, operations monitor |
| H1–H2 | Authorized staff support case and attendee contextual support request |
| M1–M14 | Dedicated Event Admin app: login, assignments, scanner, accepted/used/rejected/wrong-event results, permission/network recovery, manual check-in, undo, empty assignments and expired session |
| E1–E3 | Loading/empty/error discovery, payment/unknown-order recovery, validation/access/session recovery |
| W1–W2 | Compact attendee web discovery and checkout |
| P1 | Editable A4 PDF ticket layout with canonical ticket identity |

## Behavior decisions

- General admission is core. Assigned seating/seat holds remain bonus scope.
- First-checkout authentication is a working assumption; guest checkout needs team agreement.
- Free reservations have a zero total, no platform fee and no payment form. Paid payment/verification/payout operations are simulations; no real card fields are requested. Example amounts are synthetic; actual totals and fees come from the server.
- Mobile admission is online only. A lost connection is an unknown result, never local acceptance. Recheck status before retrying an uncertain write.
- Admission QR and campaign QR are distinct. QR blocks in this file are deliberate non-scannable placeholders.
- English review copy and KK/RU/EN controls do not certify translation correctness. The user-selected brand direction below is applied in Figma; final imagery, native platform details and implementation accessibility testing remain later work.
- Confirmation, authorized access and historical data preservation are shown for moderation/refunds/check-in undo.

## User-selected visual direction

The user supplied two university logos, a burgundy swatch and a SeatGeek typography/color reference. The gold logo was selected and placed to the left of **BiletFlow** on all 43 screen frames, including mobile and the printable ticket. The editable [gold vector asset](assets/nu-gold.svg) traces the supplied mark without an AI redraw, preserving its original crop and proportions with transparent cutouts/background.

| Role | Value |
|---|---|
| Burgundy / headers | `#380403` |
| Deep canvas | `#1E0201` |
| Surface / feedback panel | `#351514` / `#421D1C` |
| Secondary control | `#502624` |
| Border | `#A17A73` |
| University gold / primary control | `#DFB054` |
| Main / muted text | `#FFF9F5` / `#D9C7C5` |
| Dark text on gold/light fields | `#24100F` |
| Printable PDF paper | `#FFFFFF` |

Typography is **DM Sans Regular, Medium and Bold**, a close visual match to the rounded sans-serif in the supplied screenshot; the exact reference font is not asserted. Figma includes a brand board, bound color variables and a reusable vector-logo/wordmark component. Gold controls use dark text; the A4 PDF keeps a white print surface. This change applies to Figma and design documentation; the application scaffold has not been restyled.

## References and verification

[Ticketon](https://ticketon.kz/en) informed city/category/date/KZT discovery; [SeatGeek](https://seatgeek.com/) informed search/location/date structure; [Ticketmaster](https://www.ticketmaster.com/) informed category navigation and event discovery. Operational and mobile flows follow BiletFlow requirements. Controls use Simple Design System assets with editable local repeated patterns and BiletFlow brand overrides.

Structural check after branding: 43 screen frames with logo/wordmark instances, all text in DM Sans, no image-filled UI nodes, no detected child overflow or overlapping top-level frames, and 113 existing prototype links retained. Desktop discovery/checkout, the native-sized scanner and printable ticket were visually inspected. This validates the design artifact, not implementation, actual device behavior or API integration.

- [x] Editable wireframe creation and structural/visual checks.
- [ ] Yernur Slyamshaikhov reviews screen structure, behavior and open decisions; records corrections/approval.
