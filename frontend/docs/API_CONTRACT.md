# F0 API integration contract

This document records the current frontend/backend boundary. The backend source of truth is [backend/docs/openapi.yaml](../../backend/docs/openapi.yaml); generated TypeScript types must follow that file. F0 client infrastructure does not implement missing backend routes.

**Sole F0 frontend owner:** Yernur Slyamshaikhov, including foundational contract/fixture review and backend coordination. Later feature owners consume these contracts and own their feature-specific implementation; no F0 tasks are assigned to Dias.

## Endpoint readiness

**8 November version check:** the local checkout remains at F1 `d10826b`, while remote master is `793243c` (18 commits ahead). The local event router is still a scaffold; newer remote event/order implementations have not been exercised here. After Docker's update and a local startup-script line-ending correction, direct/proxied and browser health passed with mocks disabled. The API reports local MailHog SMTP and its inbox is reachable; email delivery/auth/profile/session journeys remain unverified. See [F0 recovery evidence](F0_CHECKLIST.md#recovery-observed-on-8-november-2026-1433-utc0500).

This checkout includes P1 authentication/user operations and P8 ticket operations alongside health. The table records implementation found in source; only the health connectivity and anonymous API error checks have current runtime evidence. Keep each other integration check pending until its actual responses are recorded.

| Area | Contract | Current implementation | Frontend consequence |
|---|---|---|---|
| Health | `GET /health`, at API origin root | Implemented; queries PostgreSQL | Real read/error/request-ID checks are possible when backend/database are running |
| Authentication | `/api/v1/auth/*` | P1 implements registration, verification/resend, login, refresh, logout and password recovery | Real session checks are now possible once the stack is running; frontend auth screens/session recovery belong to F1 |
| Current user/profile and staff | `/api/v1/me`, `/api/v1/organizers/me`, event staff operations | P1 implements current-user/profile reads and PATCH operations plus authorized staff assignment/removal | Verify a real bearer-authenticated read and safe profile mutation; keep permission and assigned-event discovery review explicit |
| Tickets | `/api/v1/me/tickets`, ticket details, `/tickets/{ticket_id}/qr` and `/pdf` | P8 implements authorized ticket reads, PNG QR and PDF responses | F3 now implements owned ticket UI and authenticated binary downloads; real PNG/PDF and nonowner denial were verified |
| Other event, order, check-in and feature operations | Remaining `/api/v1/*` operations in YAML | Readiness varies; these operations are not established by the P1/P8 merge alone | Use reviewed fixtures and retain explicit feature integration tasks; verify each operation before relying on it |

The live `/api/v1/openapi.json` reflects implemented routes, not the full agreed future contract. Generating from it today would omit the planned feature schemas.

## URLs and environments

| Client/environment | API origin | Path example |
|---|---|---|
| Direct local backend | `http://localhost:8000` | `/health` or `/api/v1/events` |
| Web development | Same-origin Vite proxy to `API_ORIGIN` | `/health` and `/api/v1/*` are forwarded unchanged; do not add another `/api` prefix |
| Android/iPhone on LAN | `http://<computer-LAN-IPv4>:8000` | `/health` or `/api/v1/events` |

An origin contains scheme, host and optional port, with no feature prefix. The client rejects requests that escape the configured API origin/base. Native apps are not governed by browser CORS; their network address and transport still need to be reachable and appropriate for the environment.

The backend currently allows browser origins `http://localhost:3000` and `http://localhost:5173`, including credentials, methods and request headers. It exposes `X-Request-ID`. Direct cross-origin browser testing from `127.0.0.1`, a LAN hostname, or a different port needs an explicit backend CORS change; the same-origin Vite development proxy avoids that need locally. `VITE_ENABLE_MOCKS=true` enables development mocks, so set it to `false` and restart before real API checks. Production origins and HTTPS remain deployment decisions.

## Response conventions

- API errors use `{ code, message, details }`. Translate stable `code` values for user feedback; server `message` is English developer information, not localized UX copy.
- Validation errors use `code: validation_error`, HTTP `422`, and `details: [{ field, message, type }]`. Field names may include a `body.` prefix. Do not log submitted secrets or echo raw submitted values.
- `X-Request-ID` identifies a request. The server echoes accepted IDs or generates one. Preserve the response ID on client errors for diagnosis, without logging tokens or sensitive payloads.
- Lists use `{ items, total, limit, offset }`; defaults are `limit=20`, `offset=0`, with a maximum limit of 100.
- Money is an integer in tiyn, plus currency; `100` tiyn is `1 KZT`. The server calculates purchase totals, fees and discounts.
- Timestamps include an ISO 8601 offset; display event times in their explicit event time zone, not silently in the device's zone.
- Payments, verification and payouts are simulated. Respect `is_simulated` in future financial views.
- The client must support JSON success, empty `204` responses, error bodies, network failure and cancellation. It must not silently retry mutations.
- P1 login distinguishes `401 invalid_credentials`, `403 email_not_verified` and `403 account_suspended`. Public auth operations can return `429` with `Retry-After`; preserve the error/request ID and implement the corresponding user-facing states in F1.
- For profile PATCH operations, omitted fields remain unchanged. `UserUpdate.full_name` is optional but cannot be null; `phone` is optional and can be cleared with null. Organizer profile fields are optional but cannot be explicitly null. The static contract and backend now agree on these semantics.
- P8 QR/PDF responses use `image/png` and `application/pdf`, with private/no-store cache headers. The shared client now supports explicit `responseType: "blob"`; default requests remain JSON. F3 uses the existing session controller so binary GETs retain coordinated refresh, canonical JSON-error handling, aborts and URL/redirect boundaries. It builds canonical same-API paths from ticket IDs, sends bearer headers, validates MIME/nonempty content and revokes display/download object URLs. Credentials never enter image/download URLs. Failed ticket or QR status reads hide the old admission code.

## F3 integration snapshot — 8 November 2026

The F3 branch is based on merged master `f94f783`. P5 `POST /api/v1/orders`, owned `/me/orders` and order detail match the generated order/ticket contracts. The real free path, response-loss retry, single order/inventory consumption, organizer attendee API visibility and protected P8 downloads/ownership denial passed against the local PostgreSQL-backed API. See [F3_CHECKLIST.md](F3_CHECKLIST.md) for scope and safe evidence.

Implemented P3 availability is `{ event_id, registration_open, ticket_types: [{ id, is_free, price_amount, currency, quantity_available, max_per_order, sales_open, ... }] }`; the older static contract/F2 fixtures expose an `AvailabilityOut[]` with `ticket_type_id`, `available`, and `on_sale`. F3 validates both at its boundary and permits only a genuine zero-price/free selection; it does not guess paid-price unit conversions. Existing F2 detail still expects the array and was observed throwing `tickets.data?.map is not a function`; reconcile that contract and venue/ticket response shapes with Dias/Dos rather than changing backend schemas in F3.

No quote or lookup-by-idempotency-key endpoint exists in this snapshot. Pre-submit zero-price eligibility is rechecked, while actual order totals/status remain authoritative. A positive/pending response is displayed as pending, not falsely confirmed; any `is_simulated` order is labeled. No expiry countdown is invented because OrderOut exposes no expiry timestamp. Uncertain same-page retries reuse the exact frozen body/key; an unknown result after the body is lost on reload stays fail-closed. Only opaque attempt/order IDs persist per account/event. A known result can be reopened after sign-in and a deliberate new registration requires a confirmed terminal order read first.

P9 `notify()` remains a logging stub: free-registration/ticket emails are not delivered by that path. P1 verification/reset mail still uses local MailHog independently. Refund-policy readback, image attachment, paid payments, seating, promotion and physical printed-ticket/check-in acceptance retain their corresponding owner/module dependencies.

Health succeeds with:

```json
{ "status": "ok", "database": "ok", "version": "0.1.0" }
```

If PostgreSQL is unavailable, health returns HTTP `503` with `code: database_unavailable`. This is different from a client network failure, an unimplemented feature route, or an invalid session.

## Web and native sessions

The current schema/dependency contract uses:

```text
Authorization: Bearer <access-token>
TokenOut: { access_token, refresh_token, token_type }
RefreshIn: { refresh_token }
```

P1 implements this JSON bearer contract. Login and refresh return token pairs; refresh consumes and replaces the old refresh token. Logout requires the current bearer credential and a `RefreshIn` body, then returns `204`. There is no `Set-Cookie` implementation. A future HttpOnly-cookie web-refresh contract requires an explicit backend change and review.

Coordinate refresh as a single in-flight operation per session. Reusing an unexpired, already rotated refresh token causes P1 to revoke all refresh sessions for that user. Do not refresh in parallel or blindly retry a refresh after an uncertain response. F0's JSON client performs no implicit refresh; F1 must implement and verify session recovery against this behavior.

F0 separates platform storage adapters:

- **Web:** access/refresh token pairs stay in memory. Refreshing the browser clears this state; do not add local/session storage persistence to disguise the missing cookie/session contract.
- **Native:** access tokens stay in memory; only refresh credentials use `expo-secure-store`. A restarted process must exchange its stored refresh credential before it has an access token. Keep the adapter separate from browser assumptions and clear credentials on logout/session failure; backend lifecycle and actual device verification remain pending.
- **Shared:** portable client/types and an asynchronous token-store interface. No DOM, native storage dependency or hidden authentication state in shared contract code.

Tests of a token store or mock bearer request prove client infrastructure only. P1 supplies the backend endpoints, but real authentication, token rotation/revocation and session recovery still require integrated tests. Login/reset/profile screens belong to F1. The current F0 diagnostic page can check real health; its mock-only mutation controls do not verify live authenticated frontend behavior.

## Decisions for backend handoff

| Decision | Frontend owner | Backend contact | Required agreement |
|---|---|---|---|
| Web token transport/recovery | Yernur Slyamshaikhov | Yernur (backend) | Keep JSON/memory semantics or add a reviewed cookie contract; define refresh expiry, revocation and CSRF/CORS requirements |
| Native session lifecycle | Yernur Slyamshaikhov | Yernur (backend) | Native-compatible login/refresh/logout, persisted credential policy and assigned-event discovery |
| Event permissions | Yernur Slyamshaikhov | Yernur (backend) | Global role versus per-event `manager`, `checkin`, `support` assignments; current-user capability/assignment response |
| First real mutation | Yernur Slyamshaikhov | Yernur (backend) | P1 provides profile PATCH operations; select safe test data and verify auth/validation/error behavior against the running backend |
| Event/ticket fixture shapes | Yernur Slyamshaikhov | Dos (backend) | Review the shared F0 fixtures against YAML; later F2 implementation remains with its sole owner |
| Payment/QR readiness | Yernur Slyamshaikhov | Dima (backend) | P8 ticket/QR/PDF source is implemented; verify authorized reads and binary content during F3 integration. Payment and ticket issuance dependencies require their own readiness checks |
| Partial profile update | Yernur Slyamshaikhov | Yernur (backend) | Schema mismatch resolved in P1: omitted fields stay unchanged, only user phone accepts explicit null. Verify these semantics in real profile editing and keep fixtures aligned |

Neither frontend student should change backend schemas or declare these decisions agreed without the corresponding backend review. Yernur (backend) and Yernur Slyamshaikhov are different people.
