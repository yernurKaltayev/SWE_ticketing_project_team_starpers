# F0 API integration contract

This document records the current frontend/backend boundary. The backend source of truth is [backend/docs/openapi.yaml](../../backend/docs/openapi.yaml); generated TypeScript types must follow that file. F0 client infrastructure does not implement missing backend routes.

**Sole F0 frontend owner:** Yernur Slyamshaikhov, including foundational contract/fixture review and backend coordination. Later feature owners consume these contracts and own their feature-specific implementation; no F0 tasks are assigned to Dias.

## Endpoint readiness

At the P0 snapshot reviewed for F0, the YAML declares 101 operations across 87 paths, while the only implemented application route is `GET /health`. Feature routers are registered but contain no operations. Treat the table as a readiness record to update when implementations land.

| Area | Contract | Current implementation | Frontend consequence |
|---|---|---|---|
| Health | `GET /health`, at API origin root | Implemented; queries PostgreSQL | Real read/error/request-ID checks are possible when backend/database are running |
| Authentication | `/api/v1/auth/*` | Not implemented; current calls return `404` | Mock client/session behavior; real login, refresh and logout remain blocked |
| Current user/profile | `/api/v1/me`, organizer profile operations | Not implemented | Real identity/capabilities and a profile mutation cannot yet be verified |
| Events, orders, tickets, check-in and other features | `/api/v1/*` operations in YAML | Not implemented | Use reviewed fixtures and retain explicit API-integration tasks |

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

No authentication routes or `Set-Cookie` implementation exist yet. A future HttpOnly-cookie web-refresh contract needs an explicit backend change and review; F0 must not describe it as implemented.

F0 separates platform storage adapters:

- **Web:** access/refresh token pairs stay in memory. Refreshing the browser clears this state; do not add local/session storage persistence to disguise the missing cookie/session contract.
- **Native:** access tokens stay in memory; only refresh credentials use `expo-secure-store`. A restarted process must exchange its stored refresh credential before it has an access token. Keep the adapter separate from browser assumptions and clear credentials on logout/session failure; backend lifecycle and actual device verification remain pending.
- **Shared:** portable client/types and an asynchronous token-store interface. No DOM, native storage dependency or hidden authentication state in shared contract code.

Tests of a token store or mock bearer request prove client infrastructure only. Real authentication, token rotation/revocation and session recovery require implemented backend endpoints and integrated tests. Login/reset/profile screens belong to F1.

## Decisions for backend handoff

| Decision | Frontend owner | Backend contact | Required agreement |
|---|---|---|---|
| Web token transport/recovery | Yernur Slyamshaikhov | Yernur (backend) | Keep JSON/memory semantics or add a reviewed cookie contract; define refresh expiry, revocation and CSRF/CORS requirements |
| Native session lifecycle | Yernur Slyamshaikhov | Yernur (backend) | Native-compatible login/refresh/logout, persisted credential policy and assigned-event discovery |
| Event permissions | Yernur Slyamshaikhov | Yernur (backend) | Global role versus per-event `manager`, `checkin`, `support` assignments; current-user capability/assignment response |
| First real mutation | Yernur Slyamshaikhov | Yernur (backend) or Dos (backend) | Identify the first implemented mutation and its readiness; verify auth/validation/error behavior against it |
| Event/ticket fixture shapes | Yernur Slyamshaikhov | Dos (backend) | Review the shared F0 fixtures against YAML; later F2 implementation remains with its sole owner |
| Payment/QR readiness | Yernur Slyamshaikhov | Dima (backend) | Record foundational payment/ticket validity and state/error contracts; later module implementation stays with each module's sole owner |
| Partial profile update | Yernur Slyamshaikhov | Yernur (backend) | YAML currently marks nullable `UserUpdate.full_name` and `phone` as required, unlike the Python defaults. F0's typed mock supplies both; agree optional-versus-null behavior before real profile editing. |

Neither frontend student should change backend schemas or declare these decisions agreed without the corresponding backend review. Yernur (backend) and Yernur Slyamshaikhov are different people.
