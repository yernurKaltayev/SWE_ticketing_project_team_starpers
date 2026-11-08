// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createSession, createMemoryTokenStore } from "@biletflow/shared";
import { SessionContext } from "../auth/session";
import { resetAuthMocks } from "../mocks/auth";
import { demoEventId, resetEventMocks } from "../mocks/events";
import { resetOrderMocks } from "../mocks/orders";
import { handlers } from "../mocks/handlers";
import CheckoutPage from "./CheckoutPage";
import Orders, { OrderDetail } from "./Orders";
import Tickets, { TicketDetail } from "./Tickets";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
beforeEach(() => {
  resetAuthMocks();
  resetEventMocks();
  resetOrderMocks();
  localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:fixture-ticket");
  URL.revokeObjectURL = vi.fn();
});
async function app(
  initial = `/events/${demoEventId}/checkout`,
  email = "attendee@example.com",
) {
  const session = createSession({
    baseUrl: "http://localhost:3000",
    tokenStore: createMemoryTokenStore(),
  });
  await session.login({ email, password: "BiletFlow123!" });
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route
              path="/events/:eventId/checkout"
              element={<CheckoutPage locale="en" />}
            />
            <Route path="/account/orders" element={<Orders locale="en" />} />
            <Route
              path="/account/orders/:orderId"
              element={<OrderDetail locale="en" />}
            />
            <Route path="/account/tickets" element={<Tickets locale="en" />} />
            <Route
              path="/account/tickets/:ticketId"
              element={<TicketDetail locale="en" />}
            />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  return session;
}
async function review() {
  const quantity = await screen.findByRole("spinbutton");
  fireEvent.change(quantity, { target: { value: "1" } });
  await userEvent.click(
    screen.getByRole("button", { name: "Review registration" }),
  );
  await screen.findByRole("heading", { name: "Review registration" });
}

it("registers a free ticket, shows authoritative totals, and retrieves the protected canonical QR", async () => {
  await app();
  await review();
  expect(screen.queryByLabelText(/card/i)).toBeNull();
  await userEvent.click(
    screen.getByRole("button", { name: "Register for free" }),
  );
  await screen.findByRole("heading", { name: "Registration confirmed" });
  expect(screen.getByText(/keep your order number/i)).toBeDefined();
  await userEvent.click(screen.getByRole("link", { name: "MOCK-TICKET-1-1" }));
  await screen.findByRole("heading", { name: "Admission QR code" });
  await waitFor(() =>
    expect(screen.getByRole("img").getAttribute("src")).toBe(
      "blob:fixture-ticket",
    ),
  );
  cleanup();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture-ticket");
});

it("preserves an uncertain registration and reuses its original key/body on explicit retry", async () => {
  const attempts: { key: string | null; body: unknown }[] = [];
  server.use(
    http.post("*/api/v1/orders", async ({ request }) => {
      attempts.push({
        key: request.headers.get("Idempotency-Key"),
        body: await request.json(),
      });
      return HttpResponse.error();
    }),
  );
  await app();
  await review();
  await userEvent.click(
    screen.getByRole("button", { name: "Register for free" }),
  );
  await screen.findByText(/could not confirm the outcome/i);
  expect(screen.queryByRole("button", { name: "Edit details" })).toBeNull();
  expect(attempts).toHaveLength(1);
  await userEvent.click(
    screen.getByRole("button", { name: "Retry the same registration" }),
  );
  await waitFor(() => expect(attempts).toHaveLength(2));
  expect(attempts[0]).toEqual(attempts[1]);
});

it("keeps the cart editable after an inventory rejection and does not retry the write automatically", async () => {
  let requests = 0;
  server.use(
    http.post("*/api/v1/orders", () => {
      requests++;
      return HttpResponse.json(
        { code: "inventory_unavailable" },
        { status: 409 },
      );
    }),
  );
  await app();
  await review();
  await userEvent.click(
    screen.getByRole("button", { name: "Register for free" }),
  );
  await screen.findByRole("alert");
  expect(requests).toBe(1);
  await userEvent.click(screen.getByRole("button", { name: "Edit details" }));
  expect(
    (screen.getByLabelText("Full name · 1") as HTMLInputElement).value,
  ).toBe("Demo attendee");
  expect((screen.getByRole("spinbutton") as HTMLInputElement).value).toBe("1");
});

it("blocks a reloaded uncertain registration without retaining attendee data in storage", async () => {
  const session = await app();
  cleanup();
  localStorage.setItem(
    `biletflow:f3:attempt:${session.getSnapshot().user!.id}:${demoEventId}`,
    JSON.stringify({ key: crypto.randomUUID() }),
  );
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <SessionContext.Provider value={session}>
        <MemoryRouter initialEntries={[`/events/${demoEventId}/checkout`]}>
          <Routes>
            <Route
              path="/events/:eventId/checkout"
              element={<CheckoutPage locale="en" />}
            />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
  await screen.findByText(/previous registration may have completed/i);
  expect(
    screen.queryByRole("button", { name: "Register for free" }),
  ).toBeNull();
});

it("shows a safe denial for an inaccessible order without private data", async () => {
  server.use(
    http.get("*/api/v1/orders/:id", () =>
      HttpResponse.json(
        { code: "forbidden" },
        {
          status: 403,
          headers: { "X-Request-ID": "order-denied" },
        },
      ),
    ),
  );
  await app("/account/orders/not-owned");
  await screen.findByText(
    "This order or ticket is unavailable to this account.",
  );
  expect(screen.getByText(/order-denied/)).toBeDefined();
  expect(screen.queryByText("MOCK-TICKET-1-1")).toBeNull();
});

it("never confirms an assigned-seat checkout as a general-admission registration", async () => {
  server.use(
    http.get("*/api/v1/events/:id", () =>
      HttpResponse.json({
        id: demoEventId,
        title: "Assigned event",
        venue_id: "venue",
        starts_at: "2027-01-01T00:00:00Z",
        ends_at: "2027-01-02T00:00:00Z",
        timezone: "Asia/Almaty",
        status: "published",
        seating_mode: "assigned",
      }),
    ),
  );
  await app();
  await screen.findByText(/requires seat selection/);
  expect(screen.queryByRole("spinbutton")).toBeNull();
});

it("labels invalid attendee fields and does not submit an order", async () => {
  let writes = 0;
  server.use(
    http.post("*/api/v1/orders", () => {
      writes++;
      return HttpResponse.error();
    }),
  );
  await app();
  fireEvent.change(await screen.findByRole("spinbutton"), {
    target: { value: "1" },
  });
  fireEvent.change(screen.getByLabelText("Full name · 1"), {
    target: { value: "   " },
  });
  fireEvent.change(screen.getByLabelText("Email · 1"), {
    target: { value: "invalid" },
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Review registration" }),
  );
  await screen.findByRole("alert");
  expect(screen.getByLabelText("Email · 1").getAttribute("aria-invalid")).toBe(
    "true",
  );
  expect(
    screen.getByText("Enter a full name (1–200 characters)."),
  ).toBeDefined();
  expect(writes).toBe(0);
});

it("removes a cached admission QR and private ticket data when a status read is denied", async () => {
  await app();
  await review();
  await userEvent.click(
    screen.getByRole("button", { name: "Register for free" }),
  );
  await screen.findByRole("heading", { name: "Registration confirmed" });
  await userEvent.click(screen.getByRole("link", { name: "MOCK-TICKET-1-1" }));
  await screen.findByRole("img");
  server.use(
    http.get("*/api/v1/tickets/:id", () =>
      HttpResponse.json({ code: "forbidden" }, { status: 403 }),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByText(
    "This order or ticket is unavailable to this account.",
  );
  expect(screen.queryByRole("img")).toBeNull();
  expect(
    screen.queryByRole("button", { name: "Download printable PDF" }),
  ).toBeNull();
  expect(screen.queryByText("MOCK-TICKET-1-1")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture-ticket");
});

it("revokes the visible QR when the QR's own refresh is denied while ticket metadata still succeeds", async () => {
  await app();
  await review();
  await userEvent.click(
    screen.getByRole("button", { name: "Register for free" }),
  );
  await screen.findByRole("heading", { name: "Registration confirmed" });
  await userEvent.click(screen.getByRole("link", { name: "MOCK-TICKET-1-1" }));
  await screen.findByRole("img");
  server.use(
    http.get("*/api/v1/tickets/:id/qr", () =>
      HttpResponse.json({ code: "forbidden" }, { status: 403 }),
    ),
  );
  await userEvent.click(screen.getByRole("button", { name: "Refresh status" }));
  await screen.findByText(
    "This order or ticket is unavailable to this account.",
  );
  expect(screen.queryByRole("img")).toBeNull();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:fixture-ticket");
});

it("identifies tickets by authoritative event title/date without fetching an event once per ticket", async () => {
  let eventReads = 0;
  server.use(
    http.get("*/api/v1/me/tickets", () =>
      HttpResponse.json({
        items: ["first", "second"].map((id) => ({
          id,
          ticket_number: `T-${id}`,
          event_id: demoEventId,
          ticket_type: "General admission",
          attendee_name: "Same attendee",
          seat: null,
          status: "valid",
          qr_url: `/api/v1/tickets/${id}/qr`,
          pdf_url: `/api/v1/tickets/${id}/pdf`,
        })),
        total: 2,
        limit: 20,
        offset: 0,
      }),
    ),
    http.get("*/api/v1/events/:id", () => {
      eventReads++;
      return HttpResponse.json({
        id: demoEventId,
        title: "Shared authoritative event",
        venue_id: "venue",
        starts_at: "2027-02-01T12:00:00Z",
        ends_at: "2027-02-01T14:00:00Z",
        timezone: "Asia/Almaty",
        status: "published",
        seating_mode: "general_admission",
      });
    }),
  );
  await app("/account/tickets");
  expect(await screen.findAllByText("Shared authoritative event")).toHaveLength(
    2,
  );
  expect(screen.getAllByText(/Asia\/Almaty/)).toHaveLength(2);
  expect(eventReads).toBe(1);
});

it("shows a pending server outcome without claiming free confirmation or ticket issuance", async () => {
  server.use(
    http.post("*/api/v1/orders", () =>
      HttpResponse.json({
        id: "pending-order",
        order_number: "PENDING-1",
        status: "pending",
        subtotal: 100,
        total: 100,
        processing_fee: 0,
        discount_amount: 0,
        currency: "KZT",
        is_simulated: true,
        items: [],
        tickets: [],
      }),
    ),
    http.get("*/api/v1/orders/pending-order", () =>
      HttpResponse.json({
        id: "pending-order",
        order_number: "PENDING-1",
        status: "pending",
        subtotal: 100,
        total: 100,
        processing_fee: 0,
        discount_amount: 0,
        currency: "KZT",
        is_simulated: true,
        items: [],
        tickets: [],
      }),
    ),
  );
  await app();
  await review();
  await userEvent.click(
    screen.getByRole("button", { name: "Register for free" }),
  );
  await screen.findByText(/Payment is pending/);
  expect(screen.getByText("Simulated", { exact: true })).toBeDefined();
  expect(
    screen.queryByRole("heading", { name: "Registration confirmed" }),
  ).toBeNull();
  expect(screen.queryByRole("link", { name: /MOCK-TICKET/ })).toBeNull();
});
