# BiletFlow Backend – Implementation Plan

## Context
BiletFlow is an event-ticketing platform for Kazakhstan (prices in KZT). The SRS v0.3 backend extract (`biletFlow_1_Backend.pdf`) defines the services, business rules and data model. This plan splits the backend into independent parts and assigns them to the three backenders (Yernur, Dos, Dima). The parts can be built in parallel once the shared contracts from Part 0 are agreed.

**Stack (chosen):** Python **FastAPI** + **PostgreSQL** (SQLAlchemy 2 + Alembic, Pydantic v2), Docker Compose for local/demo deployment, S3-compatible storage (MinIO locally), pytest for tests.
Libraries: `reportlab` or `weasyprint` (PDF), `qrcode` (QR), `itsdangerous`/HMAC (signed tokens), `passlib[argon2]` (password hashing), `icalendar` (.ics), `fastapi-mail` or an SMTP/transactional provider (email), `APScheduler`/Celery-lite (background jobs).

**Academic-MVP scope rules (from SRS):** payments, identity checks, payouts = sandbox or clearly labelled simulation; online check-in only (no offline sync); support chat = REST + polling (no WebSockets); no visual layout editor; no per-ticket service fee; GA4 optional.

---

## Ownership Overview

| Owner | Parts | SRS area |
|---|---|---|
| **Yernur** | P0 Foundation/DevOps, P1 Auth & Accounts, P9 Notifications, P10 Support Cases, P11 Admin, P12 Audit & Event History, P13 Analytics | Area 1: architecture, integration, auth, deployment |
| **Dos** | P2 Events & Venues, P3 Ticket Types & Inventory, P4 Seating & Seat Holds, P5 Orders & Free Registration, P14 Calendar Export | Area 2: events, tickets, orders, seat reservation |
| **Dima** | P6 Payments, Activation & Payouts, P7 Cancellations & Refunds, P8 Digital Tickets (QR/PDF), P15 Check-In, P16 Promo Codes & Campaign QR | Payments, ticket artifacts, verification, promotions |

Load is roughly balanced: Dos owns the hardest concurrency work (seat holds, inventory). Dima owns money flow and the ticket lifecycle. Yernur owns platform plumbing plus cross-cutting services.

---

## Phase Timeline (from SRS §13)
- **Weeks 1–2:** P0 (all three agree stack, API contracts, data model, repo and CI).
- **Weeks 3–4:** P1, P2 (auth, roles, organizer profiles, event creation).
- **Weeks 5–6:** P3, P4, P5, P6, P8 (ticket types, inventory, sandbox checkout, orders, QR generation).
- **Week 7:** P8 PDF, P16 promo/campaign QR, P14 calendar (only if core flow is on schedule), then P7, P15.
- **Remaining:** P9–P13 incrementally; hardening, tests, demo deployment.

---

## P0 – Foundation, Contracts and Deployment (Yernur, with all three for contracts)
**Goal:** a shared skeleton so the other parts can work in parallel.
- Repo layout: `app/{core,db,models,schemas,routers,services,tasks}`, `tests/`, `alembic/`, `docker/`.
- Config via env vars (pydantic-settings); structured logging; global error format (`{code, message, details}`); request-ID middleware.
- PostgreSQL schema v1 + Alembic baseline migration for all 24 SRS entities (User, Organizer Profile, Event, Venue, Venue Section, Row, Seat, Seat Hold, Ticket Type, Order, Order Item, Ticket, Attendee, Payment, Refund, Payout Account, Check-In Record, Staff Assignment, Notification, Support Case, Support Message, Promotional Campaign, Promo Code, Promo Redemption, Audit Log). Each owner then extends their tables.
- Money handling: integer **tiyn/KZT minor units** or `Numeric(12,2)`, one shared `Money` helper; currency column on every monetary record (future multi-currency).
- Shared dependencies: `get_db`, `get_current_user`, `require_role(...)`, `require_event_access(event_id)` (organizer/staff ownership check), pagination helper.
- OpenAPI contract draft (`/api/v1`), agreed in week 1, kept as the source of truth.
- Docker Compose: `api`, `postgres`, `minio`, `mailhog` (dev email), `worker`; `.env.example`.
- CI: lint (ruff), type check (mypy optional), pytest, build image on each PR.
- Document the stack rationale (SRS requires a short rationale) in `docs/architecture.md`.
- Seed script: admin user, demo organizer, one predefined venue layout, sample event.

**Done when:** `docker compose up` gives a working API with `/health`, migrations applied, CI green, contract doc merged.

---

## P1 – Authentication, Accounts and Roles (Yernur)  *SRS 4.1*
- Register with email, email verification token, sign in/out, password reset, JWT access + refresh (refresh rotation/revocation for sign-out).
- Argon2 password hashing; rate limiting on login/reset.
- Roles: `attendee`, `organizer`, `organizer_staff`, `platform_admin`; `Staff Assignment` (per-event staff roles, e.g. check-in staff, support staff).
- Organizer profile: contact info, payout info reference, verification status (simulated identity check).
- Decision to settle: do attendees need accounts or can they buy as guests? Recommend **account optional via email-linked guest orders**, but default to accounts for MVP simplicity.
- Endpoints: `POST /auth/register|login|logout|refresh|verify-email|forgot-password|reset-password`, `GET/PATCH /me`, `GET/PATCH /organizers/me`, `POST/DELETE /events/{id}/staff`.
- Tests: auth flows, token expiry, role guards.

## P2 – Events and Venues (Dos)  *SRS 4.2, 3.1*
- Event CRUD: create, edit, duplicate (copies config only, never orders/tickets/payments/check-ins/support), publish, unpublish, cancel.
- Fields: title, description, category, images (S3 upload, presigned URLs), venue, start/end date-time and **time zone**, visibility (public/unlisted/private + shareable slug/token), registration open/close, capacity.
- Event status lifecycle: Draft → Published → (Upcoming/Active/Completed derived from dates) / Cancelled.
- Venue + predefined layouts (see P4); public listing/search/filter (category, date, city); organizer's own event list.
- Validation: cannot publish without ≥1 ticket type; capacity ≥ sum of ticket quantities.
- Cancelling triggers hooks into P7 (refunds) and P9 (notifications); price/capacity changes write audit entries (P12).

## P3 – Ticket Types and Inventory (Dos)  *SRS 4.3*
- Free/paid ticket types: name, description, price, quantity, sales start/end, per-order limit, hidden flag (hide without deleting).
- Inventory counters: available, reserved, sold, refunded, checked-in. Derive from ticket/order rows or maintain with atomic `UPDATE ... WHERE available >= n` to block overselling.
- Public ticket-availability endpoint; sales-window and registration-window enforcement.
- Paid-type gating hook: paid purchases blocked until P6 says the event is activated.

## P4 – Assigned Seating and Seat Holds (Dos)  *SRS 4.3.1* — highest concurrency risk
- Models: Venue → Section → Row → Seat (accessible flag, price category).
- Seed ≥1 predefined layout; organizer selects layout and maps price categories to ticket types; GA vs assigned-seating toggle per event.
- Seat map endpoint (status per seat: available / held / sold).
- **Seat Hold:** `POST /events/{id}/holds` with seat IDs. Use a transaction with `SELECT ... FOR UPDATE SKIP LOCKED` or a unique partial index `(event_id, seat_id) WHERE status IN ('held','sold')` so two concurrent checkouts cannot take the same seat. Holds have `expires_at` (e.g. 10 min).
- Expiry: background job releases expired holds (plus lazy expiry on read); release on abandoned checkout or failed payment.
- Section/row/seat stored on order item and ticket.
- Tests: concurrent hold race (threads/asyncio gather), expiry, release.

## P5 – Orders and Free Registration (Dos)  *SRS 4.4, 4.6 (order part), 4.9 (view)*
- Cart/checkout session: inventory (or seats) reserved temporarily, totals calculated server-side (ticket subtotal, promo discount from P16, processing charge, total).
- Order states: `pending → paid | free_confirmed | failed | expired | cancelled | refunded`.
- **Free registration:** zero-value order, no payment info; issues tickets immediately (calls P8), sends confirmation (P9); organizer sees attendee list.
- Paid orders: hand off to P6, tickets only issued on confirmed payment; failed/abandoned orders release inventory and create no valid tickets.
- Attendee: list/view own orders; organizer: list orders and attendee list per event (filter/export CSV).
- Idempotency key on order creation to avoid duplicates on retries.

## P6 – Payments, Paid-Sales Activation and Payouts (Dima)  *SRS 3.2, 3.3, 4.5, 4.6*
- **Payment abstraction:** `PaymentProvider` interface with `SandboxProvider` (internal simulation clearly labelled "DEMO/SIMULATED") so a real provider can be swapped in later. No card data stored.
- Payment lifecycle: create intent → confirm via callback/webhook (signature verified) → mark paid → trigger ticket issuance; handle failure/timeout.
- **Paid Sales Activation per event:** checklist = event + ≥1 paid ticket type, identity/payout verification (simulated), activation fee paid, payout account registered, terms accepted. Activation applies only to the selected event; admin can suspend (P11).
- Activation fee: configurable KZT amount (admin setting P11); open question on refundability.
- Processing fee deducted per transaction (configurable %); organizer sees gross sales, fees, refunds, estimated payouts.
- Payout account CRUD (simulated); payout status and schedule (reserve/delay policy configurable); payout status notifications.
- Every payment record stores a `is_simulated` flag; UI/API must never present it as real money.
- Tests: success, failure, duplicate webhook (idempotency), activation gating.

## P7 – Cancellations and Refunds (Dima)  *SRS 4.9*
- Organizer-defined refund policy per event.
- Organizer cancels free registrations; authorized organizers initiate **full refunds**; event cancellation triggers bulk refunds.
- Refund → provider call (sandbox), set Refund record, order/ticket status `refunded`/`cancelled` so tickets become invalid immediately (checked by P15), inventory/seat released.
- Audit log entry for every payment and refund action (P12 service); refund-completion notification (P9).

## P8 – Digital Tickets, QR and Printable PDF (Dima)  *SRS 4.7*
- Ticket issuance service called by P5/P6: unique ticket ID, event + ticket-type info, attendee info, seat info, status (valid, checked in, cancelled, refunded).
- **Tamper-resistant QR:** payload = ticket ID + HMAC signature (server secret, or short opaque token looked up in DB). Never encode price/discount. Distinct format/prefix from Campaign QR (P16).
- QR image endpoint; print-optimized **A4 PDF** (legible text, high-contrast QR, works in grayscale, no card data); same ticket ID for digital and PDF copies.
- Endpoints: `GET /tickets/{id}`, `GET /tickets/{id}/pdf`, `GET /me/tickets`; PDFs generated on demand or cached in S3.
- Ticket delivery by email (via P9) and via the attendee's account.

## P9 – Notifications (Yernur)  *SRS 4.10*
- Notification service + `Notification` table (in-app) + email sender abstraction (SMTP/transactional provider; MailHog in dev).
- Templates/events: account verification, registration/purchase confirmation, payment failure, ticket delivery, event update, event cancellation, refund completion, payout status, support message/assignment/status change.
- Sent via background worker with retry; failures logged, never block the main request (checkout must not wait on email).
- Endpoints: `GET /me/notifications`, mark as read.
- Other parts call `notify(event_type, user, context)`.

## P10 – Support Chat and Case Management (Yernur)  *SRS 4.13*
- Support Case (auto-attached user/event/order/ticket context), issue category enum, status (Open, In Progress, Waiting for Customer, Resolved), assignee.
- Support Message thread via REST; polling endpoint (`?after=<message_id>`); no WebSockets.
- Access control: attendee ↔ organizer support staff for attendee cases; organizer ↔ platform admin for organizer cases; enforced by role **and** relationship to event/order/ticket.
- Case history retained; notifications on reply/status change (P9); audit entries for status changes (P12).

## P11 – Platform Administration (Yernur)  *SRS 4.12*
- Admin-only endpoints: search users/events/orders/payments; suspend users/events; review reported events (add `Report` model or flag); inspect activation records; monitor refunds, disputes, payment failures; manage settings (activation fee, processing %, hold duration); review escalated support cases and promo activity; export operational reports (CSV).
- Suspending paid sales sets activation status to suspended (consumed by P6).

## P12 – Audit Log and Event History (Yernur)  *SRS 4.16*
- Append-only `AuditLog` (timestamp, acting user, action type, affected entity, description); no update/delete endpoints; DB-level revoke of UPDATE/DELETE for the app role if feasible.
- `audit(...)` helper used by all parts: publish/cancel, price/capacity change, refund, promo create/disable, support status change, check-in/reversal, payment actions.
- `GET /events/{id}/history` filter by date range and activity type; same event-level authorization as the underlying data (organizer staff vs admin).
- Event classification Upcoming/Active/Completed/Cancelled; completed/cancelled events keep all records readable.

## P13 – Organizer Analytics (Yernur)  *SRS 4.15*
- Aggregation endpoints from authoritative DB records (never GA4): capacity, sold, remaining, % sold; gross sales, discounts, refunds, net (KZT); sales over time (by order timestamp); sales by ticket type; campaign/promo redemptions and revenue; checked-in, absent, check-in %.
- Filters: event, date range, ticket type. Organizer sees only own events.
- Use read-only SQL aggregates/materialized views so analytics never slows checkout.
- Optional GA4 events are a frontend concern; no PII in them.

## P14 – Calendar Export (Dos)  *SRS 4.11 – only if core flow on schedule*
- `GET /events/{id}/calendar.ics`: title, start/end with event time zone (VTIMEZONE), venue name/address, description, event URL, stable `UID` per event (same UID on updates, increasing `SEQUENCE`).
- Cancelled events return an updated `.ics` with `STATUS:CANCELLED`. No calendar write access needed.

## P15 – Ticket Verification and Check-In (Dima)  *SRS 4.8*
- `POST /checkin/verify` (QR payload): validate signature, ticket exists, belongs to this event, status `valid`; reject Campaign QR codes and unknown tokens; target response < 2 s.
- Record check-in atomically (`UPDATE ... WHERE status='valid'`) so a ticket cannot be used twice; return clear reasons (already used, refunded, wrong event).
- Authorized undo of an accidental check-in (audit logged).
- Stats: registered vs checked-in totals; attendee list with status. Check-in staff access via Staff Assignment.
- Online mode only; offline sync deferred.

## P16 – Promo Codes and Campaign QR Codes (Dima)  *SRS 4.14*
- Campaign: % or fixed KZT discount, validity dates, max redemptions, applicable ticket types, enabled flag.
- System-generated unique promo code and **Campaign QR image** that encodes an HTTPS event link with an opaque campaign token (no price/discount value).
- Validation endpoint: rejects expired, disabled, exhausted, or inapplicable codes with clear messages; discount computed only on the server.
- **Atomic redemption:** single SQL `UPDATE promo SET used = used + 1 WHERE used < max` (or row lock) inside the order transaction; release on failed/expired order.
- Campaign QR resolver (`/c/{token}` → redirect to event page with promo applied after validation) and strict rejection by the check-in endpoint (P15).
- Per-campaign reporting: redemptions, orders, tickets sold, gross revenue, discount, net revenue (feeds P13).

---

## Cross-Part Dependencies and Integration Order
1. P0 → everything.
2. P1 (auth/roles) → P2, P10, P11, P15.
3. P2 + P3 → P4 → P5 → P6 → P8 (end-to-end purchase flow). **First integration milestone: free registration → QR ticket → email** (P1, P2, P3, P5, P8, P9).
4. **Second milestone:** paid checkout with seat selection (adds P4, P6, P16).
5. P7, P15 after tickets/payments exist; P12 audit helper should land early (end of P0) so everyone can call it.
6. P13 analytics last, over stable tables.

Shared "service interfaces" (agreed in P0 so work isn't blocked):
`notify()` (P9), `audit()` (P12), `issue_tickets(order)` (P8), `PaymentProvider` (P6), `apply_promo()` (P16), `release_inventory(order)` (P3/P4), `require_event_access()` (P0/P1). Each owner stubs the others at first.

## Working Agreements
- Branch per part (`feat/p4-seat-holds`), PRs reviewed by one other backender; migrations conflicts resolved by rebasing Alembic heads weekly.
- API changes go through the OpenAPI contract file first.
- Each part ships with unit + API tests; payment and QR-validation tests mandatory (SRS testing requirement).

## Security and Non-Functional Checklist (applies to all)
- TLS in transit; secrets in env vars; encrypt sensitive fields at rest (payout details); Argon2 hashing; no card data stored.
- Role + ownership checks on every endpoint (organizer sees only own events, support/history/analytics included).
- Atomic operations for seat reservation and promo redemption; idempotent payment webhooks.
- Analytics/PDF/email work must not block checkout (background workers, read-only queries).
- KZT everywhere, currency column kept for future expansion; i18n-ready error codes.
- Scheduled backups (pg_dump cron container) and a documented restore procedure.

## Open Decisions (to resolve in weeks 1–2)
Activation fee amount/refundability; payment sandbox vs internal simulation (recommend internal simulation first); attendee accounts required vs guest checkout; who pays processing fees; payout delay/reserve policy; organizer verification requirements; cancellation/refund rules; initial promo discount types, limits and report fields; retention period for history/audit.

## Verification (end-to-end)
1. `docker compose up`; run migrations and seed script; `pytest` green in CI.
2. Scripted smoke flow via API (or Postman/httpx): register organizer → verify email (MailHog) → create event + free ticket → publish → attendee registers → receives email, QR + PDF → check-in succeeds once, second scan rejected.
3. Paid flow: add paid ticket → attempt purchase (blocked) → complete activation checklist → buy with sandbox payment → ticket issued only after confirmation → refund → ticket invalid at check-in.
4. Concurrency tests: N parallel holds on one seat (exactly one wins); N parallel redemptions of a promo with max=k (exactly k succeed); duplicate payment webhook (single ticket set).
5. Authorization tests: organizer A cannot access organizer B's events, analytics, history, or support cases; Campaign QR rejected by check-in endpoint.
6. Calendar `.ics` imports correctly into Google/Apple Calendar with the right time zone.

---

# Appendix A – File Hierarchy

```
swe_project/backend/
├── README.md
├── pyproject.toml                 # deps, ruff, pytest config
├── .env.example
├── docker-compose.yml             # api, worker, postgres, minio, mailhog
├── Dockerfile
├── alembic.ini
├── alembic/
│   ├── env.py
│   └── versions/                  # one migration per change, prefixed by part (p4_seat_holds)
├── docs/
│   ├── architecture.md            # stack rationale
│   ├── openapi.yaml               # API contract (source of truth)
│   └── data-model.md
├── scripts/
│   ├── seed.py                    # admin, demo organizer, venue layout, sample event
│   └── backup.sh
├── app/
│   ├── main.py                    # FastAPI app, router registration, middleware
│   ├── core/                      # [P0 Yernur]
│   │   ├── config.py              # pydantic-settings
│   │   ├── security.py            # JWT, argon2, HMAC signing
│   │   ├── deps.py                # get_db, get_current_user, require_role, require_event_access
│   │   ├── errors.py              # error format + handlers
│   │   ├── money.py               # KZT helpers
│   │   ├── pagination.py
│   │   └── logging.py
│   ├── db/
│   │   ├── base.py                # Declarative Base, mixins (id, created_at, updated_at)
│   │   └── session.py
│   ├── models/                    # SQLAlchemy models, one file per aggregate
│   │   ├── user.py                # User, OrganizerProfile, StaffAssignment      [P1]
│   │   ├── event.py               # Event                                        [P2]
│   │   ├── venue.py               # Venue, VenueSection, Row, Seat               [P4]
│   │   ├── ticket_type.py         # TicketType                                   [P3]
│   │   ├── seat_hold.py           # SeatHold                                     [P4]
│   │   ├── order.py               # Order, OrderItem, Attendee                   [P5]
│   │   ├── payment.py             # Payment, PayoutAccount, PaidSalesActivation  [P6]
│   │   ├── refund.py              # Refund                                       [P7]
│   │   ├── ticket.py              # Ticket                                       [P8]
│   │   ├── checkin.py             # CheckInRecord                                [P15]
│   │   ├── promo.py               # PromotionalCampaign, PromoCode, PromoRedemption [P16]
│   │   ├── notification.py        # Notification                                 [P9]
│   │   ├── support.py             # SupportCase, SupportMessage                  [P10]
│   │   ├── audit.py               # AuditLog                                     [P12]
│   │   └── setting.py             # PlatformSetting                              [P11]
│   ├── schemas/                   # Pydantic request/response models, mirror models/
│   │   ├── auth.py  user.py  event.py  venue.py  ticket_type.py  hold.py
│   │   ├── order.py  payment.py  refund.py  ticket.py  checkin.py
│   │   ├── promo.py  notification.py  support.py  audit.py  analytics.py  admin.py
│   ├── routers/                   # thin HTTP layer, all under /api/v1
│   │   ├── auth.py                # /auth/*                       [P1]
│   │   ├── users.py               # /me, /organizers/me, staff    [P1]
│   │   ├── events.py              # /events, publish, duplicate   [P2]
│   │   ├── venues.py              # /venues, seat map             [P4]
│   │   ├── ticket_types.py        # /events/{id}/ticket-types     [P3]
│   │   ├── holds.py               # /events/{id}/holds            [P4]
│   │   ├── orders.py              # /orders, /me/orders, attendees [P5]
│   │   ├── payments.py            # /payments, webhooks, activation, payouts [P6]
│   │   ├── refunds.py             # /orders/{id}/refund           [P7]
│   │   ├── tickets.py             # /tickets, /pdf, /me/tickets   [P8]
│   │   ├── checkin.py             # /checkin/*                    [P15]
│   │   ├── promos.py              # /campaigns, /promo/validate, /c/{token} [P16]
│   │   ├── notifications.py       # /me/notifications             [P9]
│   │   ├── support.py             # /support/cases                [P10]
│   │   ├── admin.py               # /admin/*                      [P11]
│   │   ├── history.py             # /events/{id}/history          [P12]
│   │   ├── analytics.py           # /events/{id}/analytics        [P13]
│   │   └── calendar.py            # /events/{id}/calendar.ics     [P14]
│   ├── services/                  # business logic, no HTTP types
│   │   ├── auth_service.py  email_verification.py
│   │   ├── event_service.py  inventory_service.py  seat_service.py
│   │   ├── order_service.py  checkout_service.py
│   │   ├── payments/ {base.py (PaymentProvider), sandbox.py, activation.py, payout.py}
│   │   ├── refund_service.py
│   │   ├── ticket_service.py  qr_service.py  pdf_service.py
│   │   ├── checkin_service.py
│   │   ├── promo_service.py  campaign_qr_service.py
│   │   ├── notification_service.py  email_sender.py
│   │   ├── support_service.py  audit_service.py  analytics_service.py
│   │   ├── calendar_service.py  storage_service.py (S3/MinIO)
│   ├── tasks/                     # background jobs
│   │   ├── worker.py
│   │   ├── expire_holds.py  expire_orders.py  send_emails.py  payouts.py
│   └── templates/
│       ├── emails/ (verify, ticket, refund, cancellation...)
│       └── ticket_pdf.html
└── tests/
    ├── conftest.py                # test DB, client, factories
    ├── factories.py
    ├── unit/                      # services, qr, money, promo math
    ├── api/                       # one file per router
    ├── concurrency/               # seat race, promo race, webhook idempotency
    └── e2e/                       # free flow, paid flow, refund flow
```

# Appendix B – Data Models (PostgreSQL)

Conventions: `id` = UUID PK; `created_at`, `updated_at` timestamptz on all tables; money = `bigint` in **tiyn** (1 KZT = 100) + `currency char(3) default 'KZT'`; enums are PG enums or CHECK-constrained text; `FK` = foreign key with index.

## Identity (P1)
**users**: id, email (unique, citext), password_hash, full_name, phone?, role enum(attendee, organizer, platform_admin), email_verified_at?, is_suspended bool, last_login_at?
**refresh_tokens**: id, user_id FK, token_hash, expires_at, revoked_at?
**email_tokens**: id, user_id FK, purpose enum(verify, reset), token_hash, expires_at, used_at?
**organizer_profiles**: id, user_id FK unique, organization_name, contact_email, contact_phone, verification_status enum(unverified, pending, verified, rejected), terms_accepted_at?
**staff_assignments**: id, event_id FK, user_id FK, role enum(manager, checkin, support), assigned_by FK; unique(event_id, user_id)

## Events and venues (P2, P4)
**events**: id, organizer_id FK→organizer_profiles, title, description, category, image_urls jsonb, venue_id FK, layout_id? FK, starts_at, ends_at, timezone (IANA), visibility enum(public, unlisted, private), share_token unique, status enum(draft, published, cancelled), seating_mode enum(general_admission, assigned), capacity int, registration_opens_at?, registration_closes_at?, paid_sales_status enum(disabled, active, suspended), refund_policy jsonb, cancelled_at?, duplicated_from_id?
**venues**: id, name, address, city, lat?, lng?
**venue_layouts**: id, venue_id FK, name
**venue_sections**: id, layout_id FK, name, price_category
**venue_rows**: id, section_id FK, label, position
**seats**: id, row_id FK, number, is_accessible bool, price_category; unique(row_id, number)

## Tickets and inventory (P3)
**ticket_types**: id, event_id FK, name, description, price_amount, currency, quantity_total, is_free bool, sales_start?, sales_end?, max_per_order, is_hidden bool, price_category? (links to seat categories), counters: qty_reserved, qty_sold, qty_refunded, qty_checked_in; CHECK(qty_reserved + qty_sold <= quantity_total)

## Seat holds (P4)
**seat_holds**: id, event_id FK, seat_id FK, session_id/user_id FK, order_id? FK, status enum(held, converted, released, expired), expires_at
Partial unique index: `UNIQUE(event_id, seat_id) WHERE status = 'held'`; sold seats guarded by unique index on `tickets(event_id, seat_id) WHERE status IN ('valid','checked_in')`.

## Orders (P5)
**orders**: id, order_number unique, event_id FK, buyer_user_id? FK, buyer_email, status enum(pending, paid, free_confirmed, failed, expired, cancelled, refunded, partially_refunded), subtotal, discount_amount, processing_fee, total, currency, promo_code_id? FK, idempotency_key unique, expires_at, is_simulated bool
**order_items**: id, order_id FK, ticket_type_id FK, seat_id? FK, section_name?, row_label?, seat_number?, unit_price, quantity, line_total
**attendees**: id, order_id FK, order_item_id? FK, full_name, email, phone?

## Payments (P6)
**payments**: id, order_id? FK, activation_id? FK, kind enum(ticket, activation_fee), provider enum(sandbox, ...), provider_ref, status enum(pending, succeeded, failed, cancelled), amount, fee_amount, currency, is_simulated bool default true, failure_reason?, raw_event jsonb; unique(provider, provider_ref) for webhook idempotency
**payout_accounts**: id, organizer_id FK, bank_name, iban_encrypted, holder_name, is_verified bool, is_simulated
**paid_sales_activations**: id, event_id FK unique, identity_verified bool, payout_account_id? FK, activation_payment_id? FK, terms_accepted_at?, status enum(incomplete, active, suspended), suspended_reason?, activated_at?
**payouts**: id, organizer_id FK, event_id FK, gross, fees, refunds, net, status enum(pending, scheduled, paid, failed), scheduled_for?, paid_at?

## Refunds (P7)
**refunds**: id, order_id FK, payment_id FK, amount, reason, initiated_by FK→users, status enum(pending, completed, failed), provider_ref?, completed_at?

## Tickets (P8)
**tickets**: id (public ticket identifier), ticket_number unique, order_item_id FK, event_id FK, ticket_type_id FK, attendee_id FK, seat_id? FK, section_name?, row_label?, seat_number?, qr_token unique (HMAC-signed/opaque), status enum(valid, checked_in, cancelled, refunded), issued_at, pdf_object_key?

## Check-in (P15)
**checkin_records**: id, ticket_id FK, event_id FK, staff_user_id FK, checked_in_at, reverted_at?, reverted_by?, revert_reason?, result enum(accepted, reverted)
Unique partial index: `UNIQUE(ticket_id) WHERE reverted_at IS NULL`.

## Promotions (P16)
**promotional_campaigns**: id, event_id FK, name, discount_type enum(percent, fixed), discount_value, valid_from, valid_to, max_redemptions, redemptions_count, applicable_ticket_type_ids uuid[], is_enabled bool, qr_token unique (opaque), qr_object_key?
**promo_codes**: id, campaign_id FK, code unique (case-insensitive), is_enabled
**promo_redemptions**: id, promo_code_id FK, campaign_id FK, order_id FK unique, discount_amount, status enum(applied, released), redeemed_at

## Notifications (P9)
**notifications**: id, user_id FK, type enum(account_verification, purchase_confirmation, payment_failed, ticket_delivery, event_update, event_cancelled, refund_completed, payout_status, support_message, support_assigned, support_status), title, body, payload jsonb, read_at?, email_status enum(pending, sent, failed), email_attempts int

## Support (P10)
**support_cases**: id, requester_id FK, audience enum(attendee_case, organizer_case), category enum(ticket_delivery, payment, refund, seating, event_info, check_in, account, technical), status enum(open, in_progress, waiting_customer, resolved), assignee_id? FK, event_id? FK, order_id? FK, ticket_id? FK, subject
**support_messages**: id, case_id FK, author_id FK, body, created_at (indexed for polling `after=`)

## Admin and audit (P11, P12)
**platform_settings**: key PK, value jsonb (activation_fee_amount, processing_fee_percent, hold_minutes, ...), updated_by FK
**event_reports**: id, event_id FK, reporter_id FK, reason, status enum(open, reviewed, dismissed, actioned)
**audit_logs** (append-only): id, occurred_at, actor_id? FK, actor_role, action_type, entity_type, entity_id, event_id? FK (indexed for history), description, metadata jsonb

## Key relationships
users 1—1 organizer_profiles 1—N events 1—N ticket_types; events N—1 venues 1—N layouts 1—N sections 1—N rows 1—N seats; events 1—N orders 1—N order_items 1—N tickets 1—0..1 checkin_records; orders 1—N payments 1—N refunds; events 1—1 paid_sales_activations; events 1—N promotional_campaigns 1—N promo_codes 1—N promo_redemptions N—1 orders; support_cases link to event/order/ticket; audit_logs reference everything by (entity_type, entity_id).

# Appendix C – Representative API Schemas (Pydantic)

```python
# schemas/auth.py
class RegisterIn(BaseModel):  email: EmailStr; password: constr(min_length=8); full_name: str; role: Literal["attendee","organizer"]
class LoginIn(BaseModel):     email: EmailStr; password: str
class TokenOut(BaseModel):    access_token: str; refresh_token: str; token_type: str = "bearer"

# schemas/event.py
class EventCreate(BaseModel):
    title: str; description: str; category: str; venue_id: UUID; layout_id: UUID | None
    starts_at: datetime; ends_at: datetime; timezone: str
    visibility: Literal["public","unlisted","private"] = "public"
    seating_mode: Literal["general_admission","assigned"] = "general_admission"
    capacity: int; registration_opens_at: datetime | None; registration_closes_at: datetime | None
class EventOut(EventCreate):  id: UUID; status: str; paid_sales_status: str; share_token: str; images: list[str]

# schemas/ticket_type.py
class TicketTypeIn(BaseModel):
    name: str; description: str | None; price_amount: int = 0   # tiyn
    quantity_total: int; sales_start: datetime | None; sales_end: datetime | None
    max_per_order: int = 10; is_hidden: bool = False; price_category: str | None
class TicketTypeOut(TicketTypeIn): id: UUID; available: int; reserved: int; sold: int; refunded: int; checked_in: int

# schemas/hold.py
class HoldIn(BaseModel):  seat_ids: list[UUID]
class HoldOut(BaseModel): hold_ids: list[UUID]; expires_at: datetime

# schemas/order.py
class OrderItemIn(BaseModel):  ticket_type_id: UUID; quantity: int; seat_ids: list[UUID] = []
class AttendeeIn(BaseModel):   full_name: str; email: EmailStr
class OrderCreate(BaseModel):  event_id: UUID; items: list[OrderItemIn]; attendees: list[AttendeeIn]; promo_code: str | None
class OrderOut(BaseModel):     id: UUID; order_number: str; status: str; subtotal: int; discount_amount: int; processing_fee: int; total: int; currency: str; is_simulated: bool; items: list[OrderItemOut]; tickets: list[TicketOut]

# schemas/ticket.py
class TicketOut(BaseModel): id: UUID; ticket_number: str; event_id: UUID; ticket_type: str; attendee_name: str; seat: SeatRef | None; status: str; qr_url: str; pdf_url: str

# schemas/checkin.py
class VerifyIn(BaseModel):  event_id: UUID; qr_payload: str
class VerifyOut(BaseModel): result: Literal["accepted","already_used","invalid","refunded","wrong_event","not_a_ticket"]; ticket: TicketOut | None; message: str

# schemas/promo.py
class CampaignIn(BaseModel):  name: str; discount_type: Literal["percent","fixed"]; discount_value: int; valid_from: datetime; valid_to: datetime; max_redemptions: int; ticket_type_ids: list[UUID]
class PromoValidateOut(BaseModel): valid: bool; discount_amount: int; reason: str | None

# schemas/support.py
class CaseCreate(BaseModel):  category: str; subject: str; event_id: UUID | None; order_id: UUID | None; ticket_id: UUID | None; message: str
class MessageIn(BaseModel):   body: str

# schemas/analytics.py
class AnalyticsOut(BaseModel):
    capacity: int; sold: int; remaining: int; percent_sold: float
    gross: int; discounts: int; refunds: int; net: int
    sales_over_time: list[Point]; by_ticket_type: list[Row]; campaigns: list[CampaignStat]
    checked_in: int; absent: int; checkin_percent: float
```
