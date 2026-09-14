# BiletFlow — Project Plan & Architecture Reference

> Source of truth: `BiletFlow_SRS_Initial_Draft.pdf` (v0.3, Initial Draft).
> This document translates that SRS into an actionable engineering plan. It is meant to be the
> base reference for all future architecture and implementation work on this repo — keep it
> updated as decisions in Section 9 ("Open Decisions") get resolved.

## 1. What BiletFlow Is

A Kazakhstan-focused, self-service event ticketing platform (course project, team of 5,
10–12 week academic MVP, **not** a production financial system). Organizers create events and
issue tickets for free; selling paid tickets requires a one-time "Paid Sales Activation" flow
(identity/payout verification + activation fee — **simulated/sandboxed**, no real money for the
academic MVP). Attendees discover events, register/purchase, get QR-coded digital tickets,
export to calendar, and get checked in by an Event Admin using a dedicated mobile app.

Four user roles: **Attendee**, **Organizer**, **Event Admin** (mobile check-in staff, assigned
per event, distinct from Platform Admin), **Platform Admin** (internal moderation/ops).

## 2. Technology Stack (decided)

| Layer | Choice | Notes |
|---|---|---|
| Backend framework | **FastAPI** (Python) | Locked in — this is our team's backend choice (SRS "Backend Option 2"). One primary backend implementation only; no parallel-language services. |
| Backend language | Python 3.12+ | |
| Database | **PostgreSQL** (recommended) | Relational data (events, seats, orders, tickets, payments) with strong consistency needs (atomic seat holds, no double-selling) fits relational modeling far better than MongoDB. Confirm formally with the team, but design around Postgres unless overridden. |
| ORM / migrations | SQLAlchemy 2.x + Alembic | |
| Auth | JWT-based session auth (access/refresh tokens), password hashing via `passlib`/`bcrypt` | Role-based permissions per SRS 4.1 |
| Validation / schemas | Pydantic v2 (native to FastAPI) | |
| Web frontend | React + TypeScript, Tailwind CSS | Next.js only if SSR/SEO is needed for public event pages |
| Seat map UI | React + SVG or Canvas rendering | One predefined venue layout for MVP; server-validated holds |
| Mobile ticket-verification app | React Native (optionally Expo) | For Event Admins only; online-verification only (no offline sync) in MVP |
| Payments | Provider sandbox OR internal simulation, KZT | No real money movement required for MVP |
| Email | Transactional email provider (e.g. SendGrid/SES/Postmark) | Verification, confirmations, notifications |
| File storage | S3-compatible object storage | Printable ticket PDFs, campaign QR images, event images |
| PDF tickets | Server-generated from canonical ticket record | Print-optimized, QR large/clear enough for grayscale scanning |
| Support chat | REST API with polling/periodic refresh | No WebSockets/real-time required for MVP |
| Campaign QR codes | Server-generated QR images encoding signed/opaque promo tokens | Must be visually/functionally distinct from admission QR; never accepted by check-in endpoint |
| Analytics | DB aggregation queries against authoritative order/ticket/campaign/check-in records | GA4 integration is optional/bonus, for traffic attribution only — never for required numbers |
| Deployment | Docker + docker-compose | Local/demo deployment only; no cloud production requirement |
| Design | Figma | |
| Testing | pytest (API), integration tests for payment-sim and QR validation, frontend component/e2e tests | |

**Explicitly excluded from MVP:** real payments/payouts, production KYC/KYB, visual
venue-layout designer, offline scanner sync, App Store/Play publication, ticket resale,
native (non-React-Native) mobile apps, recurring events, affiliate marketing, multi-owner
payout splits, full audit/version rollback.

## 3. High-Level Architecture

Single FastAPI backend (modular monolith — no microservices for MVP), organized by domain
module. Suggested backend layout:

```
backend/
  app/
    main.py                 # FastAPI app factory, router registration
    core/                   # settings, security (JWT/hashing), dependencies
    db/                     # engine/session (async SQLAlchemy), base model
    models/                 # SQLAlchemy ORM models, one file/group per domain
    schemas/                # Pydantic request/response models
    api/
      v1/
        auth.py
        users.py             # Organizer profile, roles
        events.py            # Event CRUD, publish/unpublish, duplicate
        venues.py            # Venue/Section/Row/Seat, predefined layout
        ticket_types.py
        seat_holds.py        # Temporary seat reservation w/ TTL
        checkout.py          # Order creation, payment-sim, ticket issuance
        orders.py            # Order/refund/cancellation
        tickets.py           # QR issuance, ticket PDF, status
        checkin.py           # Mobile app: scan/validate/check-in/undo
        campaigns.py         # Promo codes, campaign QR codes
        analytics.py         # Organizer dashboards
        history.py           # Event activity timeline / audit
        support.py           # Support cases & messages
        notifications.py     # Internal trigger endpoints / webhooks
        admin.py             # Platform admin moderation
    services/                # business logic per domain (kept out of routers)
    repositories/            # DB access layer (optional, keeps services testable)
    workers/                 # background jobs: seat-hold expiry, email sending, QR/PDF gen
    tasks/                   # scheduled/periodic jobs (e.g. hold cleanup)
  alembic/                   # migrations
  tests/
web/                          # React + TS web app (organizer + attendee)
mobile/                       # React Native ticket-verification app (Event Admin)
admin/                        # can be a section of web/ or separate portal
docker-compose.yml
```

**Key architectural rules driven directly by the SRS:**
- **Atomic seat reservation**: seat selection creates a time-limited hold (DB row + expiry,
  or Redis TTL) that is released on abandonment/expiry; checkout must use a transaction/lock
  so two concurrent checkouts can never win the same seat.
- **Payment gating**: paid ticket types are unpurchasable until an event completes Paid Sales
  Activation (checklist: payout account + activation fee + terms accepted). Enforce this
  server-side on every checkout attempt, not just in the UI.
- **Tickets only exist after confirmed payment** (or, for free tickets, after order creation) —
  failed/abandoned transactions must never leave a valid ticket behind.
  Digital and printed copies share one ticket identifier (no duplicate admissions).
- **Campaign QR ≠ Admission QR**: campaign QR codes only pre-apply a promo code on the event
  page after server-side validation; the check-in/admission endpoint must reject them outright
  if ever scanned there.
  All discount calculation/validation happens server-side; the client never supplies a trusted
  discount amount.
- **Role-based authorization boundaries**: Event Admins only see their assigned events;
  Organizers only see their own events/analytics/history; Support case access is scoped by
  relationship to the event/order/ticket; Platform Admins can cross these boundaries for
  moderation.
- **Audit trail**: every payment/refund action and every meaningful organizer/admin action
  (publish, cancel, price/capacity change, check-in/reversal, promo create/disable, support
  status change) is written to an append-only audit log entity, not user-editable.
- **Analytics must be computed from authoritative order/ticket/campaign/check-in tables** —
  never dependent on optional GA4 data for required numbers.

## 4. Core Data Entities

(From SRS §6 — design SQLAlchemy models + Alembic migrations around these.)

`User`, `OrganizerProfile`, `Event`, `Venue`, `VenueSection`, `Row`, `Seat`, `SeatHold`,
`TicketType`, `Order`, `OrderItem`, `Ticket`, `Attendee`, `Payment`, `Refund`, `PayoutAccount`,
`CheckInRecord`, `StaffAssignment` (Event Admin ↔ Event), `Notification`, `SupportCase`,
`SupportMessage`, `PromotionalCampaign`, `PromoCode`, `PromoRedemption`, `AuditLog`.

Rough relationships to keep in mind when modeling:
- `Event` 1—N `TicketType`, 1—N `Venue`/seating (if assigned seating), 1—N `StaffAssignment`,
  1—N `PromotionalCampaign`, 1—N `SupportCase` (via order/ticket), 1—N `AuditLog` entries.
- `Venue` 1—N `VenueSection` 1—N `Row` 1—N `Seat`; `Seat` 1—N `SeatHold` (time-boxed) and
  ultimately 0/1 `OrderItem` when sold.
- `Order` 1—N `OrderItem`, 1—1 `Payment` (+ optional `Refund`), OrderItem 1—1 `Ticket`.
- `Ticket` belongs to `Attendee` + `TicketType` (+ `Seat` if assigned seating); has status
  (valid/checked-in/cancelled/refunded).
- `PromotionalCampaign` 1—N `PromoCode` 1—N `PromoRedemption` → linked to `Order`.
- `SupportCase` 1—N `SupportMessage`; optionally linked to `Event`/`Order`/`Ticket`.

## 5. Suggested Team Ownership (5 people, per SRS §13.2)

1. **Architecture, integration, auth, deployment** — FastAPI project skeleton, DB/session
   setup, JWT auth & RBAC, Docker/compose, CI, shared API contracts.
2. **Backend core domain services** — Event, TicketType, Order, seat-hold/reservation logic,
   checkout + payment simulation, ticket/QR issuance.
3. **Web interfaces** — Organizer and Attendee-facing React/TS app (event creation,
   browsing, checkout, seat map UI, ticket download).
4. **Admin, campaigns, reporting, history, tickets** — Platform admin portal, promo
   codes/campaign QR, organizer analytics dashboard, event history/audit timeline,
   printable PDF tickets, calendar export (bonus).
5. **Mobile + support + testing/release** — React Native check-in app, support chat
   workflow, assigned-seating bonus, automated test suites, release coordination.

Ownership doesn't mean isolation — agree on API contracts (OpenAPI schema from FastAPI) and
the data model together *before* parallel work starts, since FastAPI auto-generates docs
(`/docs`) that should be treated as the living contract between frontend/mobile and backend.

## 6. MVP Scope

**Required (must ship):** auth & registration, organizer profiles, event creation/publish,
free + paid ticket types, simulated paid-sales activation, simulated KZT checkout, QR ticket
generation, downloadable/printable PDF tickets, email confirmations, attendee/order
management, React Native check-in app, basic cancellations/refunds, admin moderation,
basic organizer analytics (capacity, sales over time, revenue, ticket types, campaigns,
attendance), organizer event history + activity timeline, async support chat, promo codes +
campaign QR + basic campaign reporting, Docker-based demo deployment.

**Bonus/stretch (only after core flow is stable):** one predefined assigned-seating layout
with interactive seat selection, `.ics`/calendar-link export, advanced GA4-based analytics,
offline check-in sync, support-message file attachments.

**Explicitly excluded:** everything in SRS §8 "Excluded from the Initial MVP" — real
payments/payouts, production KYC/KYB, visual venue-layout designer, production offline
scanner sync, advanced refund/dispute workflows, app store publication, resale/transfer,
native (non-RN) apps, affiliate marketing, recurring events, marketing automation, on-site
hardware integration, multi-owner payout splits, tax automation, full version history/rollback.

## 7. Step-by-Step Delivery Plan (12-week target, per SRS §13.3)

**Weeks 1–2 — Foundation**
- [ ] Confirm/lock: DB choice (Postgres vs MongoDB), activation fee amount, payment
      simulation approach, whether attendees require accounts, who pays processing fees.
- [ ] Scaffold FastAPI backend (`backend/app/...` per §3 layout), Alembic, Docker Compose
      (api + Postgres + optional Redis for seat holds), CI (lint/test on push).
- [ ] Define OpenAPI/data-model contracts as a team; write initial SQLAlchemy models for
      User/Event/TicketType/Order/Ticket.
- [ ] Wireframes for web app (Figma).

**Weeks 3–4 — Identity & Events**
- [ ] JWT auth, email verification, password reset, RBAC (Attendee/Organizer/Event
      Admin/Platform Admin).
- [ ] Organizer profile (contact + payout info).
- [ ] Event CRUD: create/edit/duplicate/publish/unpublish/cancel; public/unlisted/private;
      registration windows; capacity.

**Weeks 5–6 — Ticketing Core**
- [ ] Ticket types (free/paid, price, quantity, sale window, per-order limits, hide-without-
      delete); live inventory counts (available/reserved/sold/refunded/checked-in).
- [ ] Seat hold mechanism with expiry (only if assigned seating is in scope this cycle;
      otherwise general-admission inventory only).
- [ ] Checkout flow: reserve → simulate/sandbox payment → confirm → issue ticket + QR;
      guarantee failed/abandoned checkouts never issue tickets.
- [ ] Paid Sales Activation flow (checklist, simulated identity + payout verification,
      one-time activation fee record).
- [ ] Order model, free-registration path (zero-value order).

**Week 7 — Tickets, Promotions**
- [ ] Server-generated print-optimized PDF tickets (event/date/venue/ticket
      type/attendee/seat/ticket ID/QR; no payment-card data).
- [ ] Promo codes + campaigns (discount rules, redemption limits, server-side validation).
- [ ] Campaign QR codes (opaque/signed token, distinct from admission QR, rejected by
      check-in endpoint).
- [ ] Calendar export (`.ics` + links) if on schedule — otherwise defer to bonus pass.

**Week 8 — Mobile & Support**
- [ ] React Native check-in app: secure sign-in, assigned-events-only view, QR scan,
      real-time validate (valid/invalid/cancelled/refunded/already-used), check-in +
      reversal, manual attendee search, online-only sync.
- [ ] Async support chat: case creation from event/order/ticket context, issue categories,
      message thread, staff assignment, status transitions
      (Open/In Progress/Waiting for Customer/Resolved), notifications.

**Week 9 — Admin, History, Analytics**
- [ ] Platform admin portal: search users/events/orders/payments, suspend, review reported
      events, inspect activation records, monitor refunds/disputes, configure fees,
      escalated support/promo review, basic report export.
- [ ] Organizer event history: Upcoming/Active/Completed/Cancelled classification,
      chronological activity timeline, duplicate-into-draft (excluding transactional data).
- [ ] Organizer analytics dashboard: capacity/sold/remaining, gross/discounts/net revenue,
      sales-over-time, sales-by-ticket-type, campaign performance, check-in %, filters by
      event/date range/ticket type.
- [ ] Assigned seating + interactive seat map (bonus) only if core flow is stable.

**Week 10 — Integration & Stabilization**
- [ ] Cross-app integration (web ↔ backend ↔ mobile), resolve defects, complete
      core-flow end-to-end tests (create event → campaign QR → promo apply → reserve/buy
      ticket → simulated checkout → issue ticket → support case → check-in).

**Weeks 11–12 — Polish & Demo Prep**
- [ ] Usability pass, WCAG 2.1 AA check on event pages, i18n (kk/ru, optional en),
      documentation, demo rehearsal, contingency buffer.

**De-scope order if behind schedule** (per SRS §13.4): drop assigned seating → calendar
export → advanced analytics → localization polish → refund simulation, in that order,
*before* touching the core ticketing flow. Feature work should generally stop after Week 9
unless a missing piece blocks the core demo.

## 8. Business / Monetization Model (for reference)

- Free events: no platform fee, full basic workflow (publish, free ticket types, QR issuance,
  attendee list, check-in, basic confirmation emails).
- Paid events: disabled until organizer creates ≥1 paid ticket type, completes identity/payout
  verification, pays the one-time Paid Sales Activation Fee (KZT, amount TBD), connects a
  payout account, and accepts paid-event terms. Platform admins can suspend paid sales for
  fraud/policy violations.
- Revenue model: one-time activation fee (free events pay nothing) + payment-processing
  charges deducted per transaction; optional per-ticket service fee is deferred past MVP.
- Everything here is simulated/sandboxed for the academic MVP — never present demo payment
  records as real financial transactions.

## 9. Open Decisions (resolve early, track answers here)

- [ ] Final project/product name (currently "BiletFlow" working title)
- [ ] Database: PostgreSQL (recommended above) vs MongoDB — confirm with team
- [ ] Paid Sales Activation fee amount + refundability
- [ ] Payment sandbox provider vs internal simulation approach
- [ ] Whether attendees must create accounts to register/purchase
- [ ] Who pays processing fees (organizer vs attendee)
- [ ] Payout delay / reserve policy (simulated)
- [ ] Organizer identity-verification requirements (simulated)
- [ ] Event cancellation and refund rules
- [ ] Predefined seating layout to use for the demo
- [ ] Whether support cases allow file attachments in MVP
- [ ] Initial promo-code discount types, redemption limits, campaign reporting fields
- [ ] Default date ranges / chart formats for the organizer dashboard
- [ ] Retention period for event history / audit entries

## 10. Non-Functional Requirements (summary)

Modern desktop/mobile browser support; current iOS/Android for the RN app; kk/ru UI
(en optional); KZT currency; encryption in transit and at rest; secure password hashing;
no direct storage of card data; auditable admin/organizer actions; WCAG 2.1 AA on event
pages; checkout resilient under traffic spikes; atomic seat reservation (no double-sell);
accessible seat map (color + text/symbols); QR validation target <2s online; scannable
printed QR in grayscale on A4; calendar exports preserve configured timezone; support-case
access enforced by role + entity relationship; promo validation/redemption enforced
atomically server-side; campaign QR never trusted for price/discount or admission; analytics
queries must not block checkout/ticket issuance; regular backups/recovery procedures.

## 11. Success Criteria (MVP "done" definition)

- Organizer publishes a free event and distributes valid tickets.
- Organizer completes simulated paid-sales activation and receives demonstration orders.
- Attendee completes checkout and receives a QR ticket; can download/print it and it still
  scans correctly at check-in.
- Event Admin uses the mobile app to validate tickets and block duplicate entry.
- Attendee opens a contextual support case and exchanges messages with organizer staff.
- Attendee redeems a Campaign QR Code for a valid, attributed discount; the admission
  scanner rejects Campaign QR codes while still accepting real ticket QR codes.
- Organizer sees accurate ticket/attendance/payment/refund records and basic analytics
  without extra attendee-collected fields.
- Organizer reviews past/cancelled events, an authorized activity timeline, and can
  duplicate a past event without copying historical transactions.
- Platform admin can suspend a suspicious event and stop further sales.

Bonus features are evaluated separately and are **not** required to hit these criteria.
