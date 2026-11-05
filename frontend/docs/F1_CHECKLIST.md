# F1 — Authentication, profiles and permissions

Frontend owner: **Yernur Slyamshaikhov** (distinct from Yernur, backend). This follow-up implements the F1 frontend against the existing P1 contract. It does not certify the integrated acceptance criteria. F0's remaining runtime/device/review gates remain pending in [F0_CHECKLIST.md](F0_CHECKLIST.md).

Follow the dependency-based incremental workflow and module ownership in [FRONTEND_PLAN.md](../../FRONTEND_PLAN.md). Pending acceptance evidence does not become passed when independent client implementation proceeds. Figma screens, structure, university logo, burgundy palette and DM Sans remain exploratory and have **not** been applied to application code; a design pass requires Yernur Slyamshaikhov's explicit approval and implementation request.

## Implemented scope

- Web routes: `/login`, `/register`, `/verify-email`, `/forgot-password`, `/reset-password`, `/account`, `/organizer/profile`.
- Register attendee/organizer accounts, explicitly submit email verification, resend verification, sign in/out, reset passwords, edit current-user and organizer contact profiles. Registration does not automatically authenticate an unverified account. Recovery/resend success messages do not reveal whether an account exists.
- Reusable labeled inputs, validation/error summaries, request IDs, pending/success states, navigation, status badges and permission/loading/error states, with kk/ru/en copy. Further tables/dialogs/pagination will be added when a module needs them.
- Organizer profiles are created by backend registration. The UI edits only `organization_name`, `contact_email` and `contact_phone`; it shows email confirmation separately from simulated organizer verification (`unverified`, `pending`, `verified`, `rejected`).
- P1 exposes no payout-account fields or terms-acceptance mutation. The organizer UI explains that payout setup belongs to the later payment integration. These controls are **pending the relevant contract/F4**, not implemented with invented fields.
- Global organizer/admin guards cover their route boundaries; those modules' business screens are not implemented here. Per-event manager/check-in/support access is not inferred from a global role. Event resources, ownership and assignments remain backend-authorized and require later integrated checks; staff-assignment screens remain F7.
- Expo Home has native sign-in/out, current user/email status, account reload and startup refresh via SecureStore. Connection/locales/the isolated F0 SecureStore probe remain available. Native registration/reset/profile editing is not added to the dedicated staff app; the web provides those account-management flows. Camera/check-in/assigned-event screens remain F7.

## Session and safety behavior

- One portable session controller per platform. Web credentials remain in memory; **browser reload signs out**. There is no local/session-storage persistence and no new cookie contract.
- Native persists only the refresh credential through the existing SecureStore adapter. Startup exchanges it before authenticated reads; access tokens stay in memory.
- Concurrent 401s share one rotating refresh operation. A late 401 does not spend the already-rotated credential again. An uncertain refresh response clears the local session instead of retrying the spent credential.
- Only GET/HEAD requests can be replayed after refresh. An expired PATCH refreshes the session but leaves the action for explicit resubmission, retaining the form draft while the session remains valid. Other failures do not silently retry writes.
- Logout/expiry/account switches clear identity and user query caches. Generation checks and serialized storage operations prevent old async responses from restoring a discarded session. Failed remote logout is reported without claiming server revocation succeeded.
- Authenticated visits to login/register redirect to the safe destination; changing accounts requires sign-out. Delayed auth-form continuations do not redirect an abandoned form or log out a newly established account after a password reset.
- Return paths must be app-relative and same-origin. External/protocol-relative/backslash/control-character URLs and auth loops (including mixed case) fall back to `/account`; valid query/fragment context is retained.
- Link tokens are consumed in memory and removed from the address bar with history replacement. Verification/reset is explicitly submitted, not triggered automatically by opening a link. The document uses a no-referrer policy. Tokens/passwords are not displayed in errors.
- PATCH sends changed fields only; clearing user phone sends `null`. Organizer fields are strings, never explicit `null`. Stable API error codes are localized instead of displaying raw backend messages/validation payloads; request IDs and `Retry-After` are retained.

## Run and review with development mocks

From `frontend/` in PowerShell:

```powershell
npm.cmd run dev:web
```

Keep `VITE_ENABLE_MOCKS=true` in the local web environment and open [sign-in](http://localhost:5173/login). The visible development notice explicitly identifies mock data. There are no emails or real registrations in this mode. Mocks are absent from production behavior; fixtures reset on full browser reload.

All seeded accounts use the **fixture-only** password `BiletFlow123!`:

| Email | Scenario |
|---|---|
| `organizer@example.com` | Verified email; organizer profile |
| `attendee@example.com` | Verified email; organizer route denied |
| `admin@example.com` | Platform admin; no implied organizer role |
| `unverified@example.com` | Attendee; login requires confirmation |
| `suspended@example.com` | Suspended account |
| `rate-limited@example.com` | 429, `Retry-After: 60` |
| `network@example.com` | Simulated connection failure |

Mock-only links: `/verify-email?token=mock-verify-unverified` and `/reset-password?token=mock-reset-organizer`. Invalid tokens exercise the expired-link recovery state. The initial tokens are single-use within the current mock lifetime. Register/resend creates `mock-verify-${encodeURIComponent(email)}`; forgot-password creates `mock-reset-${encodeURIComponent(email)}`. These deterministic fixture tokens are development helpers and are never returned by the real API or shown in product success messages. For newly registered mock accounts, use client-side navigation within the current mock lifetime; reloading reconstructs the seeded fixtures.

For native development, use the existing README LAN-origin/Expo launch instructions. Native connects to the configured real origin; it does not silently use web MSW fixtures. The device SecureStore probe alone does not prove sign-in/session recovery.

## Verification evidence — 5 November 2026

| Check | Evidence | Result |
|---|---|---|
| API type drift, lint, TypeScript, tests, production web build | `npm.cmd run check`; 60 tests across seven files | Passed locally |
| Native bundling | `npm.cmd run export:mobile`; iOS and Android Hermes exports | Passed locally; not device proof |
| Session/storage tests | Single-flight/late-401 rotation, no write replay, uncertain refresh discard, suspension, startup exchange, stale login/logout/storage races and failures | Passed with mocked transport/storage |
| Auth contract fixtures and helper tests | Seven MSW auth/profile tests and eight safe-return/permission/validation tests | Passed with mocks |
| Chromium auth/profile journeys | Validation and focus; organizer login/user+organizer PATCH; attendee role denial; safe protected return; suspended/unverified/429/network states; resend; expired-link recovery; verification; password reset/new login; registration; expired PATCH retained draft and explicit retry; reload signed out | Passed with development mocks |
| Responsive/locales | Register at 390px/1280px in kk/ru/en with long Cyrillic/Kazakh name; organizer at 320px/390px/1280px; login error at 390px. No horizontal page overflow. Captures under ignored `web/output/f1/` | Browser checks passed; owner translation review pending |
| Mechanical design checks | Impeccable detector on changed web UI/native session panel returned `[]` | Passed at checked scope |
| Independent visual review | Five final web captures reviewed; disposition `ship`; incumbent system font/paper/green style preserved | Passed at reviewed scope; no Figma implementation |
| Production boundary | Chromium production preview displays auth UI, `/dev/foundation` shows Page not found, no mock disclosure or service-worker registration; built bundles contain no fixture-token markers | Passed locally |
| Real health | Direct `http://localhost:8000/health` attempt timed out after four seconds on 5 November | Unreachable; no real auth/profile integration evidence |
| Remote CI | No push/PR was performed for F1 | Not run for this work |
| Android/iPhone launch, SecureStore and lifecycle | No physical phone interaction observed | Not verified |

## Remaining integrated acceptance

- [ ] Restore a running backend/database and verify direct and proxied health with mocks disabled. This task did not restart or repair Docker.
- [ ] Verify real register → development-mail verification → login → `/me` read/PATCH and organizer profile GET/PATCH through the web client. Check omitted/null profile semantics and retain request IDs without recording credentials.
- [ ] Verify live access expiry, one rotating refresh under concurrent reads, reuse/revocation, password-reset invalidation, logout and uncertain-network behavior. Backend source and MSW behavior are separate evidence.
- [ ] Use two real organizer accounts to prove protected event-resource isolation once the relevant module/routes are available. An attendee's mock profile denial is not proof of cross-organizer authorization.
- [ ] Confirm event-level capabilities/assigned-event discovery with Yernur (backend); do not model `organizer_staff` as a global role.
- [ ] Launch on Android and iPhone and record model/OS/Expo version. Verify native sign-in, startup SecureStore exchange, refresh/logout/expiry, keyboard, screen reader, text scaling and failed storage/network recovery on both devices.
- [ ] Yernur Slyamshaikhov reviews kk/ru/en wording and accessibility/flows. Screenshots and automated checks do not certify owner translation or Figma approval.
- [ ] Integrate payout information through the agreed later contract/F4; keep F1's missing contract explicit.
- [ ] Review the uncommitted diff and existing local documentation, then commit/push/merge manually when ready. No git publication actions were performed by the agent.

F1 has a reviewable implementation for the current contract. **The module is not marked fully accepted** until its real integration and device evidence is recorded.
