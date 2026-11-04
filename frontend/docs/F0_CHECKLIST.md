# F0 completion checklist

F0 is complete when its infrastructure is implemented **and** the acceptance evidence below is recorded. Keep implementation, automated checks, real API integration and physical-device verification separate. An unchecked external dependency does not become complete when a mock passes.

## Ownership

| Frontend owner | F0 responsibility |
|---|---|
| Yernur Slyamshaikhov — sole F0 owner | All scaffolds/contracts/adapters, Figma wireframes, fixtures, shared styles/layouts, locales/review, CI, backend coordination, phone-launch evidence and handoff documentation |

There is no F0 work assigned to Dias. F0's shared assets remain maintained by Yernur Slyamshaikhov; other module owners consume them and request changes through him. Peer review does not transfer implementation ownership.

Backend contacts are Yernur (backend), Dos (backend), and Dima (backend). They do not receive frontend implementation ownership here.

## Implementation and review

- [x] User confirmed React/TypeScript/Vite/Tailwind and React Native/Expo.
- [x] One npm workspace/lockfile installs reproducibly with `npm ci`; web, mobile and pure shared contracts/helpers have explicit boundaries.
- [x] Web routing/providers and DEV-only loading/error/empty mock checks exist; reusable business UI belongs to later modules.
- [x] Mobile skeleton uses shared contract types through a separate native transport/storage adapter.
- [x] Types generated from the static OpenAPI YAML; drift check added to CI workflow.
- [x] Shared client handles success/204, errors/request IDs, network failure, cancellation and bearer boundaries; writes are not silently retried.
- [x] Web memory store and native secure-storage adapter are separate and unit-tested; actual device behavior remains pending.
- [x] Success/empty/422/403/401/network scenarios use the normal client; 401 verifies an unauthorized/expired-session response, not implemented refresh recovery.
- [x] Initial kk/ru/en resources, language controls and exact money/explicit-time-zone helpers exist.
- [ ] Yernur Slyamshaikhov reviews actual kk/ru/en copy, long translated strings, shared styles and initial fixtures; corrects issues and records the review. Infrastructure alone does not certify translations.
- [x] Editable Figma wireframes created for event creation/detail, checkout, ticket/PDF access, mobile scanner and operational views, including navigation/loading/error states. [Figma file](https://www.figma.com/design/MSh77BTh5A82lmOsxCZnGb/BiletFlow-F0-Wireframes?node-id=0-1); inventory and verification in [WIREFRAMES.md](WIREFRAMES.md).
- [ ] Yernur Slyamshaikhov reviews the wireframes and records corrections/approval; creation alone does not certify owner approval.
- [x] Environment examples and README separate web proxy and phone LAN origins without secrets.

## Automated verification

Run from `frontend/` after a clean install. Record actual results in the evidence log; leave them unchecked until run against this version.

- [x] `npm ci` — clean final SDK 58 lockfile install passed.
- [x] `npm run check:api` — generated types match the checked-in YAML.
- [x] `npm run lint` — Oxlint passed.
- [x] `npm run typecheck` — web/mobile/shared passed.
- [x] `npm test` — 26 tests passed across shared client/formatting/stores and native storage boundary.
- [x] `npm run build:web` — production build passed; dev diagnostics/mock runtime excluded.
- [x] `npm run export:mobile` — final SDK 58 iOS and Android Hermes bundles exported.
- [ ] Frontend CI runs the required checks using the committed lockfile and supported Node version.
- [x] Browser exercise at 390px/1280px with kk/en/ru, typed mock read/mutation/empty/422/403/401/network outcomes, request IDs and no horizontal overflow; inspect captures and production 404 for DEV-only route.

An Expo export confirms bundling, not installation, secure storage, camera access or a device launch. F7 will provide actual scanning; F0's phone gate checks the application foundation.

## Real API evidence

- [ ] Start backend/database using the backend README and verify direct `GET http://localhost:8000/health` succeeds.
- [ ] Verify the web client's proxied health request uses the real API, with mocks disabled for this check.
- [ ] Record the response/request ID and canonical success body; verify a known error retains its `code`, status and request ID.
- [ ] Verify a real authenticated read and mutation once the relevant backend operations exist.
- [ ] Verify real web and native session behavior once login/refresh/logout are implemented and transport is agreed.

**Current external blockers:** Docker Desktop's engine was not running during the initial F0 environment audit, so real health could not yet be exercised. Only `/health` is implemented in the reviewed backend P0 snapshot. Auth/current-user/feature mutations currently return `404` because the routers are empty. Keep the last two API checks pending; do not substitute a mock result.

## Physical Android and iPhone launch proof

The user has both phones but explicitly deferred testing. Keep these gates pending and record OS/version/outcome later. Expo reported that installed iPhone Go expects SDK 58, so the scaffold was aligned to SDK 58 before handoff.

1. Install a compatible Expo Go version; connect the phone and development computer to the same reachable Wi-Fi/LAN.
2. From the computer, run `ipconfig` and identify its active adapter IPv4 address.
3. Set `frontend/mobile/.env.local` to `EXPO_PUBLIC_API_ORIGIN=http://<computer-IPv4>:8000`; do not use `localhost` on a physical phone.
4. Start the real backend if available, then run `npm run dev:mobile` from `frontend/`.
5. Open the displayed Metro QR/link in Expo Go. Record that the BiletFlow mobile skeleton actually opens, its text fits and available controls respond.
6. Exercise the foundation's real API check when the backend is reachable. Record an explicit unavailable/network result if it is not; do not label that as a successful real read.
7. Open Connection and press **SecureStore · F0**. Connected means the separate probe key was written/read/deleted. This does not verify real sign-in, token rotation or the full session lifecycle; those require backend P1. Automated adapter tests separately verify access-in-memory and refresh-only persistence.
8. Repeat on the other platform and record both outcomes. A single successful platform is partial completion.

- [ ] Android launch observed and documented.
- [ ] iPhone launch observed and documented.
- [ ] Native API/session-adapter evidence recorded for both devices, with backend blockers identified separately.

Do not require app-store publication, production signing/payouts, a finished camera scanner or offline admission for F0. Do not use a web preview as evidence of an iOS/Android native launch.

## Evidence log

| Check | Result/evidence | Status |
|---|---|---|
| Clean install and local commands | `npm ci`, `npm run check` (26 tests) and SDK 58 `npm run export:mobile` passed on `feat/frontend-f0`; remote CI awaits commit/push | Passed locally; remote CI pending |
| Web desktop/narrow-width and locales | Chromium: 390×844 and 1280×900; kk/en/ru, mock read/mutation/empty/errors and request IDs passed. Production DEV route returns app 404 and has no mock runtime chunk. | Passed browser check |
| Real health/client errors | Record API origin, response and request ID; never tokens | Pending |
| Real auth/read/mutation | Record endpoint/owner once implemented | Blocked by backend feature readiness |
| Android launch | Record model, OS, Expo compatibility and outcome | Deferred by user; not verified |
| iPhone launch | SDK 58 compatibility identified; successful native launch still needs device/OS evidence | Deferred by user; not verified |
| Native secure-store check | Record isolated probe set/read/delete on each phone; adapter tests are separate | Deferred by user; not verified |
| Wireframes, styles, fixtures and language review | Link the Figma file and Yernur Slyamshaikhov's review/corrections | Pending sole F0 owner |
| Web/native auth transport | Link the backend agreement and updated contract if needed | Pending backend discussion |
| Dependency audit | Clean install reports moderate upstream dependency advisories; no forced breaking dependency changes applied | Maintenance follow-up |

F0 handoff should state which items passed, which were only mocked, and what remains blocked. Update this log as evidence arrives; do not mark the entire module complete before the agreed acceptance gates are met.

## Remaining F0 actions — Yernur Slyamshaikhov

1. Review the linked Figma wireframes and record corrections/approval; review/correct shared styling, fixtures and Kazakh/Russian/English text. Wireframe creation and artifact checks are complete.
2. Launch the scaffold on Android and iPhone, check navigation/locales and the isolated SecureStore probe, and record device/OS/results. Phone testing is currently deferred by the user.
3. Start Docker/backend and verify direct and proxied real `/health`, canonical errors/request IDs, then native LAN connectivity when devices are available. Keep these results distinct from MSW success.
4. Agree and record web/native auth transport, permissions/assigned-event discovery and partial-profile-update semantics with Yernur (backend).
5. Review/commit/push the F0 work when ready, confirm GitHub CI passes and link its run; record the final handoff evidence.

Real login/refresh/logout, authenticated reads and mutations remain backend-P1/feature integration dependencies. The frontend owner verifies them when endpoints exist; implementing backend authentication or F1 sign-in screens is not additional F0 scaffold work. The clean install, generated types, lint/type checks, 26 tests, web build, mock browser checks and both native exports are already recorded as passed.
