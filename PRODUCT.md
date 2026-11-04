# BiletFlow

<!-- impeccable:product-schema 1 -->

## Platform

adaptive

Responsive organizer/attendee and platform-administration web interfaces, plus a dedicated iOS/Android Event Admin application. Native attendee/organizer apps are outside the MVP.

## Stack

User confirmed React, TypeScript, Vite and Tailwind for web; React Native with Expo for mobile. FastAPI/PostgreSQL are owned by the backend team. Both Android and iPhone test devices are available to the user; successful launches remain to be recorded.

## Users and purpose

Kazakhstan attendees obtain event tickets; organizers publish physical events and manage ticketing; assigned Event Admins verify admission; Platform Admins moderate operations. Source requirements and responsibilities are recorded in FRONTEND_PLAN.md.

## Constraints

KZT integer tiyn; Kazakh and Russian customer UI plus English locale. Payments, verification and payouts are simulations. Mobile verification is online only. Required mobile app, PDF tickets, support and basic analytics are distinct from optional seating/calendar/advanced analytics.

## Current implementation boundary

F0 establishes web/mobile entry points, contracts/adapters, locales, mocks and checks; it does not implement F1 authentication or business screens. Yernur Slyamshaikhov is the sole F0 owner, including full wireframes, shared styling, fixture/language review and acceptance evidence. Each later module also has one owner as recorded in FRONTEND_PLAN.md. The backend currently implements health only. The technical shell uses restrained platform controls; the selected Figma visual direction below has not yet been applied to application code.

## Visual direction

The user selected university branding with a gold university mark to the left of BiletFlow, deep burgundy surfaces inspired by the supplied swatch/reference, and rounded sans-serif typography. Figma uses burgundy `#380403`, canvas `#1E0201`, gold `#DFB054`, cream text and DM Sans Regular/Medium/Bold as a close reference match. The printable ticket keeps white paper. Palette roles, asset provenance and design evidence are recorded in frontend/docs/WIREFRAMES.md.

## Accessibility

Event pages target the SRS WCAG 2.1 AA baseline. Native screens respect safe areas, system text sizing and accessible control labels. Kazakh/Russian text must remain usable at narrow widths.
