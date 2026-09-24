# BiletFlow — Web

React + TypeScript web app for attendees, organizers and platform admins.
Stack: Vite, React 19, React Router 7, TanStack Query 5, Tailwind CSS 4, `qrcode.react`, `lucide-react`.

## Run

```bash
cd web
npm install
npm run dev          # http://localhost:5173
```

The dev server proxies `/api` to the backend on `http://localhost:8000` (see `vite.config.ts`),
so start the backend first (`backend/README.md`). To point at another backend, copy
`.env.example` to `.env.local` and set `VITE_API_URL`.

```bash
npm run build        # typecheck + production build into dist/
npm run lint         # oxlint
```

## What talks to the real API, and what doesn't yet

| Feature | Source |
|---|---|
| Register, login, logout, token refresh, verify email, password reset | **FastAPI** (`/auth/*`) |
| Account name, organizer profile, admin user list | **FastAPI** (`/users/*`) |
| Events, ticket types, checkout, tickets/QR, refunds, promo codes, analytics, activity log, moderation | **Preview data layer** (`src/services/*.ts` on top of `src/services/db.ts`) |

The preview layer stores data in `localStorage` (key `bf.mockdb`) and is seeded with sample events
in Almaty, Astana, Shymkent and Karaganda. Its services enforce the same rules the backend must
(PROJECT_PLAN.md §3): paid ticket types are locked until Paid Sales Activation, prices and discounts are
computed "server-side" (never taken from the client), tickets are issued only after a successful
(simulated) payment, a declined payment leaves no tickets, and campaign QR codes only pre-fill a
promo code that is validated again at checkout. Pages marked with a small "Preview data" pill use it.

**Replacing it:** each function in `src/services/{events,checkout,tickets,analytics}.ts` is async and
returns the shape the page needs. Swap the body for an `api()` call from `src/lib/api.ts` once the
matching endpoint exists. Pages don't need to change. To reset the preview data, run
`localStorage.removeItem('bf.mockdb')` in the browser console.

Emails aren't sent yet. The backend logs verification and reset tokens, and the verify/reset pages
accept a pasted token.

## Layout

```
src/
  lib/          api client (JWT + single-flight refresh), auth context, formatting (KZT, Asia/Almaty), types
  services/     account.ts → real API; db/events/checkout/tickets/analytics → preview layer
  components/   ui primitives, layout + route guard, event cards/poster art, charts
  pages/        explore, event + checkout, tickets, account, auth, organizer/*, admin
```

## Routes

| Path | Who |
|---|---|
| `/`, `/events/:id` | everyone (`?promo=CODE` pre-applies a campaign code) |
| `/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email` | everyone |
| `/checkout/:id`, `/tickets`, `/tickets/:id`, `/account` | signed in |
| `/organizer`, `/organizer/profile`, `/organizer/events[/new\|/:id\|/:id/edit]` | organizer |
| `/admin` | platform admin |

All times are shown in Almaty time (UTC+5). A new organizer can press "Add sample events with
sales" on the empty dashboard to fill in the analytics.
