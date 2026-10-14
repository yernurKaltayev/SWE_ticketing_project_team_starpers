# BiletFlow Web

React + TypeScript attendee, organizer and Platform Admin website. Events, checkout, tickets,
promotions, refunds, analytics and moderation now use the FastAPI backend. The localStorage
preview database has been removed; localStorage retains authentication tokens only.

## Run

Start the backend using backend/README.md, then:

```bash
cd web
npm ci
npm run dev
```

The dev server proxies `/api` to localhost:8000. Use VITE_API_URL in .env.local for another backend.
Account email links open the existing verification/reset pages. Checkout requires email verification.
Academic payments and paid-sales activation remain simulated and are labelled in the UI.

Organizers can create, edit, publish, unpublish, cancel and duplicate events, manage free/paid
inventory and optional registration/sale windows, create promotions and inspect database-derived
analytics and activity. Platform Admins can inspect users and suspend events. Attendees receive
persisted QR tickets after successful checkout and can request eligible simulated refunds.
Print / PDF currently uses the browser's print dialog; server-generated ticket PDFs and purchase
confirmation emails remain future work.

## Checks

```bash
npm run lint
npm run build
npx playwright install chromium
npm run test:e2e
```

The smoke tests launch an isolated SQLite backend and Vite server, provision synthetic demo
accounts and use separate browser contexts. They cover an organizer-created event, a persisted
attendee QR ticket at phone width, declined paid checkout and campaign-discount purchase. They
require uv and backend dependencies installed first. Servers on ports 8000 and 5173 must be free.
The tests do not use real payments or deliver external emails.

## Routes

| Route | Access |
| --- | --- |
| /, /events/:id | Public published/unlisted event pages |
| /login, /register, /forgot-password, /reset-password, /verify-email | Account flows |
| /checkout/:id, /tickets, /tickets/:id, /account | Signed in |
| /organizer and /organizer/events/* | Organizer |
| /admin | Platform Admin |

Times use Almaty time (UTC+5) and monetary amounts use whole KZT. API response types are mirrored
in src/lib/types.ts; the OpenAPI schema is the authoritative backend contract.
