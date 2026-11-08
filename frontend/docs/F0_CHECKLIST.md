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
- [x] Frontend CI runs the required checks using the committed lockfile and supported Node version. [Successful master run](https://github.com/yernurKaltayev/SWE_ticketing_project_team_starpers/actions/runs/41889259608), merge commit `c8678bf`.
- [x] Browser exercise at 390px/1280px with kk/en/ru, typed mock read/mutation/empty/422/403/401/network outcomes, request IDs and no horizontal overflow; inspect captures and production 404 for DEV-only route.

An Expo export confirms bundling, not installation, secure storage, camera access or a device launch. F7 will provide actual scanning; F0's phone gate checks the application foundation.

## Real API evidence

### Preflight observed on 8 November 2026

- Checkout: `feat/frontend-f1` at `d10826b860273f6744d3933f26945128fc4e9b64`. Remote branch matches; remote `master` is `793243c6e982ebdf58fa43b647b8f4f38ea7a82c`, 18 commits ahead. No checkout update, commit, push or merge was performed. Existing local edits, untracked runbook and stash were preserved; documentation was also copied to a temporary backup before edits.
- Docker client 29.7.2 and Compose v5.4.0 are installed. `docker version` cannot connect to `dockerDesktopLinuxEngine`; direct `/health` fails to connect. No successful API response/request ID was obtained.
- A normal `docker desktop start` attempt produced a fresh backend crash at `2026-11-08T09:17:32Z`: `initializing Ingest server` could not remove `C:/Users/user/AppData/Local/Docker/run/sailor-ingest.sock` because `The file cannot be accessed by the system`. Docker backend exited. Attempts to move/rename only this stale socket as a backup failed with the same Windows error; the socket remains intact. No reset or volume deletion was attempted.
- WSL status/list succeed outside the restricted execution environment: default version 2; Ubuntu and docker-desktop are stopped. The earlier restricted `E_ACCESSDENIED` result is not evidence of a broken WSL installation.
- Compose source defaults to local MailHog, but effective runtime configuration/delivery has not been verified. `backend/.env` is absent; the existing web `.env.local` still has `VITE_ENABLE_MOCKS=true` and was preserved. Real testing requires explicitly disabling mocks and confirming effective local SMTP settings before starting services.
- Real direct/proxied health, canonical API errors, authenticated reads/mutations, MailHog delivery and both physical phones remain unverified. The first concrete blocker is Docker's inaccessible runtime socket.

### Recovery observed on 8 November 2026, 14:33 (UTC+05:00)

- After Docker's update, the Linux engine responded with version 29.9.2. No socket deletion, factory reset or volume deletion was performed. The first image pull ended with `unexpected EOF`; individual pulls and the subsequent build succeeded.
- The API initially exited with `exec ./docker/start-api.sh: no such file or directory`. Inspection inside its image confirmed `#!/bin/sh\r\n`. The clean local script was backed up and converted from CRLF to LF; its commands and Git content diff are unchanged. A rebuild then started the API successfully. Git's current checkout settings may restore CRLF later; retain this Windows setup issue for backend/P0 coordination.
- Compose services started; PostgreSQL and API are healthy, MailHog/MinIO/worker are running, and the one-shot MinIO initializer exited 0. The development seed completed.
- Direct health returned HTTP 200, `{"status":"ok","database":"ok","version":"0.1.0"}`, request ID `a2aa53d8fe7245d79da4cf3918669ee9`. Vite-proxied health returned the same body and HTTP 200, request ID `e334eb9d3206464c93d7b269408ec9d3`.
- Anonymous direct `GET /api/v1/me` returned HTTP 401, `code: unauthorized`, `details: null`, request ID `d67e2a3e276049b7b6772f5ec7673c1f`. This verifies a canonical API error, not authenticated integration or frontend error rendering.
- The existing web environment was backed up before setting `VITE_ENABLE_MOCKS=false`. An isolated browser confirmed `config.useMocks=false`, zero registered service workers, and the same-origin API proxy. Clicking **Check connection** displayed **Connected** and the real health body; its GET returned 200 with request ID `cb0cc451d2404bcebe6e9c20c2155389`. Screenshot: ignored `frontend/web/output/playwright/real-health-connected.png`.
- Runtime API settings explicitly report `mailhog:1025`, STARTTLS false, no SMTP credentials, and `WEB_BASE_URL=http://localhost:5173`. MailHog's API returned 200 and an empty inbox. Email delivery has not yet been exercised. Access-token lifetime remains the genuine configured 30 minutes.
- Auth/profile/session journeys, frontend error rendering, actual mail delivery, native LAN connectivity, and both physical phones remain pending. No automated suite, native export, or fresh CI result is asserted by this recovery check.

- [x] Start backend/database using the backend README and verify direct `GET http://localhost:8000/health` succeeds.
- [x] Verify the web client's proxied health request uses the real API, with mocks disabled for this check.
- [x] Record the response/request ID and canonical success body; verify a known error retains its `code`, status and request ID.
- [ ] Verify a real authenticated read and mutation using the implemented P1 `/api/v1/me` GET/PATCH operations with mocks disabled.
- [ ] Verify web/native session adapters against P1 JSON bearer login/refresh/logout; coordinate token rotation in dependent session code and distinguish adapter evidence from the later F1 UI.

**Historical runtime blocker (recovered on 8 November):** On 4 November 2026, `http://localhost:8000/health` was unreachable. Docker's Linux-engine pipe was missing; Docker Desktop startup failed around its local `sailor-ingest.sock` runtime socket, and a normal restart attempt timed out. The recovery evidence above now verifies health; authenticated reads/mutations and sessions remain unverified. P1 authentication/current-user/profile/staff and P8 ticket/QR/PDF routes exist in this checkout's backend source.

- [x] Backend-readiness documentation updated for merged P1/P8 source and synchronized API types; source availability is distinct from runtime/device verification.

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
| Clean install and local commands | `npm ci`, `npm run check` (26 tests) and SDK 58 `npm run export:mobile` passed locally; PR #6 merged into master at `c8678bf`; [frontend CI passed](https://github.com/yernurKaltayev/SWE_ticketing_project_team_starpers/actions/runs/41889259608) | Passed locally and in remote CI |
| Web desktop/narrow-width and locales | Chromium: 390×844 and 1280×900; kk/en/ru, mock read/mutation/empty/errors and request IDs passed. Production DEV route returns app 404 and has no mock runtime chunk. | Passed browser check |
| Real health/client errors | 8 November: direct/proxied and browser health passed with mocks disabled; canonical anonymous API 401 and request IDs recorded above | Health/direct API error passed; frontend error rendering pending |
| Real auth/read/mutation | Running P1 `/me` GET/PATCH and JSON bearer auth are ready for real client exercise with mocks disabled | Pending; not verified |
| Android launch | Record model, OS, Expo compatibility and outcome | Deferred by user; not verified |
| iPhone launch | SDK 58 compatibility identified; successful native launch still needs device/OS evidence | Deferred by user; not verified |
| Native secure-store check | Record isolated probe set/read/delete on each phone; adapter tests are separate | Deferred by user; not verified |
| Wireframes, styles, fixtures and language review | Link the Figma file and Yernur Slyamshaikhov's review/corrections | Pending sole F0 owner |
| Web/native auth transport | P1 JSON bearer transport and refresh rotation are documented in [API_CONTRACT.md](API_CONTRACT.md); HttpOnly web-cookie proposal and assigned-event discovery still need coordination | Source contract reviewed; integration pending |
| Dependency audit | Clean install reports moderate upstream dependency advisories; no forced breaking dependency changes applied | Maintenance follow-up |

F0 handoff should state which items passed, which were only mocked, and what remains blocked. Update this log as evidence arrives; do not mark the entire module complete before the agreed acceptance gates are met.

## Remaining F0 actions — Yernur Slyamshaikhov

1. Review the linked Figma wireframes and record corrections/approval; review/correct shared styling, fixtures and Kazakh/Russian/English text. Wireframe creation and artifact checks are complete.
2. Launch the scaffold on Android and iPhone, check navigation/locales and the isolated SecureStore probe, and record device/OS/results. Phone testing is currently deferred by the user.
3. Direct/proxied and browser real health plus the anonymous API error passed on 8 November. Complete authenticated reads/mutations, frontend error rendering and native LAN connectivity when devices are available. Keep these results distinct from MSW success.
4. Exercise the documented P1 JSON bearer/refresh and partial-profile-update semantics; coordinate remaining cookie/permissions/assigned-event discovery decisions with Yernur (backend).
5. Original F0 PR #6 is merged and frontend CI has passed. Review/commit/push follow-up documentation separately when ready; retain pending runtime/device evidence in the handoff.

P1 login/refresh/logout and authenticated profile operations exist in source and await frontend runtime integration evidence. Implementing backend authentication or F1 sign-in screens is not additional F0 scaffold work. The clean install, synchronized generated types, lint/type checks, 26 tests, web build, mock browser checks, both native exports and remote frontend CI are recorded as passed. Assuming the remaining checks will succeed does not verify them.
