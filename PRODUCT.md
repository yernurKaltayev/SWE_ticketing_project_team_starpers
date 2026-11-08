# BiletFlow

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Responsive organizer/attendee and platform-administration web interfaces, plus a dedicated iOS/Android Event Admin application. Native attendee/organizer apps are outside the MVP.

## Stack

User confirmed React, TypeScript, Vite and Tailwind for web; React Native with Expo for mobile. FastAPI/PostgreSQL are owned by the backend team. The user reports basic iPhone connection/storage/session checks passed. On 8 November the user clarified that no Android device is currently available; Android acceptance is deferred and remains untested. Device/version details for the iPhone are unrecorded.

## Users and purpose

Kazakhstan attendees obtain event tickets; organizers publish physical events and manage ticketing; assigned Event Admins verify admission; Platform Admins moderate operations. Source requirements and responsibilities are recorded in FRONTEND_PLAN.md.

## Constraints

KZT integer tiyn; Kazakh and Russian customer UI plus English locale. Payments, verification and payouts are simulations. Mobile verification is online only. Required mobile app, PDF tickets, support and basic analytics are distinct from optional seating/calendar/advanced analytics.

## Current implementation boundary

F4 is implemented locally on `feat/frontend-f4`: event activation, simulated paid checkout with server-authoritative recovery, masked payout-account management, financial summaries and payout history. Live P6 activation/payment/response-loss/reload flows and responsive captures passed; remaining owner and cross-team acceptance are tracked in frontend/docs/F4_CHECKLIST.md. The current restrained functional presentation is preserved; no Figma implementation is included.

F3 is implemented locally on `feat/frontend-f3`, based on master `f94f783`: free general-admission quantity/attendee review and registration, stable idempotency/recovery, owned orders/tickets and canonical authenticated QR/PDF downloads. Current checks passed 105 tests plus the web build and both native exports; the real browser/backend free-registration, response-loss retry, protected download and ownership-denial paths were exercised with disposable local fixtures. P9 registration email, F2/backend contract reconciliation, physical F7 print/scan and owner translation/accessibility review remain external acceptance work. See frontend/docs/F3_CHECKLIST.md. This does not close the previously deferred F0/F1 gates.

F0's web/mobile entry points, contracts/adapters, locales, mocks and checks are merged into master, and frontend CI passed. F1's current-contract web authentication/profile/permission flows and native sessions, including refresh fix `d10826b`, are merged through PR #7; evidence is in frontend/docs/F1_CHECKLIST.md. Yernur Slyamshaikhov is the sole F0/F1 owner. Each later module also has one owner as recorded in FRONTEND_PLAN.md, whose dependency/timeline rule governs incremental implementation and parallel work. The acceptance branch includes remote master `793243c` through merge commit `4b3ced4`; later backend modules still require operation-specific integration checks. Real health and the current 79-test frontend check passed; basic web registration/verification/auth/profile/reset/role-denial and iPhone connection/storage/startup/sign-out checks are user-reported passes. Acceptance remains partial: Android is deferred because no device is available; on 8 November the user also deferred the genuine web access-expiry/refresh test for lack of time. Other unchecked request/session, event-isolation and review criteria remain explicit in the checklists. The functional frontend uses restrained platform controls.

## Visual direction

The Figma file contains 43 editable explorations whose structure and appearance can still change. The gold university mark, burgundy palette and DM Sans are provisional design references, not approved application branding. Existing palette/asset exploration evidence is recorded in frontend/docs/WIREFRAMES.md.

Do not implement Figma screens, layouts, assets, fonts or branding in web/mobile code until Yernur Slyamshaikhov explicitly approves the design for implementation and requests that work. Until then, develop functional modules in the current restrained technical style. A later approved design pass can replace the presentation while preserving required behavior, API contracts, permissions and verification.

## Accessibility

Event pages target the SRS WCAG 2.1 AA baseline. Native screens respect safe areas, system text sizing and accessible control labels. Kazakh/Russian text must remain usable at narrow widths.
