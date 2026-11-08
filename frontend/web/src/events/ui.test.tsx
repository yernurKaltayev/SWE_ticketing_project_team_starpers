// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  cleanup,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createMemoryTokenStore, createSession } from "@biletflow/shared";
import { handlers } from "../mocks/handlers";
import { resetAuthMocks } from "../mocks/auth";
import { demoEventId, resetEventMocks } from "../mocks/events";
import { SessionContext } from "../auth/session";
import { EventEditor } from "./Editor";
import { EventDetail } from "./Detail";
import { EventList } from "./Discovery";
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
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
});
async function publicPageSession() {
  const session = createSession({
    baseUrl: "http://localhost:3000",
    tokenStore: createMemoryTokenStore(),
  });
  await session.login({
    email: "organizer@example.com",
    password: "BiletFlow123!",
  });
  return session;
}
async function editor() {
  const session = createSession({
    baseUrl: "http://localhost:3000",
    tokenStore: createMemoryTokenStore(),
  });
  await session.login({
    email: "organizer@example.com",
    password: "BiletFlow123!",
  });
  render(
    <SessionContext.Provider value={session}>
      <MemoryRouter initialEntries={["/organizer/events/new"]}>
        <Routes>
          <Route
            path="/organizer/events/new"
            element={<EventEditor locale="en" />}
          />
          <Route
            path="/organizer/events/:eventId/edit"
            element={<EventEditor locale="en" />}
          />
          <Route
            path="/organizer/events/:eventId/preview"
            element={<EventDetail locale="en" preview />}
          />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  fill("Title", "Dias demonstration");
  fill("Description", "Free general admission");
  fill("Category", "student");
  await waitFor(() =>
    expect(
      screen.getByRole("option", {
        name: "Demo campus auditorium · Astana · Demo venue address",
      }),
    ).toBeDefined(),
  );
  fill("Venue", "4aab9cc5-d54c-47e8-9b53-09085463ce4c");
  fill("Starts", "2027-02-01T18:00");
  fill("Ends", "2027-02-01T20:00");
  return { fill, session };
}
it("renders the free-event journey with corrective publication errors and protected preview", async () => {
  const user = userEvent.setup();
  await editor();
  await user.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  await screen.findByRole("heading", { name: "Edit event" });
  await user.click(screen.getByRole("button", { name: "Publish" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByText("Add a ticket type before publishing.");
  await user.click(screen.getByRole("button", { name: "Add ticket type" }));
  fireEvent.change(screen.getByLabelText("Ticket name", { exact: true }), {
    target: { value: "Free admission" },
  });
  await user.click(screen.getByRole("button", { name: "Save ticket type" }));
  await screen.findByRole("rowheader", { name: "Free admission" });
  await user.click(screen.getByRole("button", { name: "Publish" }));
  await user.click(screen.getByRole("button", { name: "Confirm" }));
  await screen.findByRole("button", { name: "Return to draft" });
  await user.click(screen.getByRole("link", { name: "Protected preview" }));
  await screen.findByRole("heading", { name: "Dias demonstration" });
  await screen.findByText("Free admission", { exact: true });
});
it("retains draft fields after failed save and allows explicit recovery without duplicate writes", async () => {
  const user = userEvent.setup();
  await editor();
  let writes = 0;
  server.use(
    http.post("*/api/v1/events", () => {
      writes++;
      return HttpResponse.json(
        { code: "service_unavailable", message: "Unavailable", details: null },
        { status: 503 },
      );
    }),
  );
  await user.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  await screen.findByRole("alert");
  expect(
    (screen.getByLabelText("Title", { exact: true }) as HTMLInputElement).value,
  ).toBe("Dias demonstration");
  expect(writes).toBe(1);
  server.resetHandlers();
  await user.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  await screen.findByRole("heading", { name: "Edit event" });
});
it("reports invalid wall-time fields with a focused, linked error and sends no create request", async () => {
  const user = userEvent.setup();
  const { fill } = await editor();
  let writes = 0;
  server.use(
    http.post("*/api/v1/events", () => {
      writes++;
      return HttpResponse.error();
    }),
  );
  fill("Event time zone (IANA)", "Invalid/Zone");
  await user.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  const alert = await screen.findByRole("alert");
  expect(document.activeElement).toBe(alert);
  expect(alert.querySelector("a")?.getAttribute("href")).toBe("#starts_at");
  expect(writes).toBe(0);
});
it("creates an event with live P4 venue arrays, then saves and edits a paid ticket using live P3 arrays", async () => {
  const rows: Record<string, unknown>[] = [];
  let savedBody: Record<string, unknown> | undefined;
  server.use(
    http.get("*/api/v1/venues", () =>
      HttpResponse.json([
        {
          id: "4aab9cc5-d54c-47e8-9b53-09085463ce4c",
          name: "Demo campus auditorium",
          city: "Astana",
          address: "Demo venue address",
        },
      ]),
    ),
    http.get("*/api/v1/events/:id/ticket-types", () => HttpResponse.json(rows)),
    http.post("*/api/v1/events/:id/ticket-types", async ({ request }) => {
      savedBody = (await request.json()) as Record<string, unknown>;
      const row = {
        ...savedBody,
        id: "live-ticket",
        price_amount: String(savedBody.price_amount) + ".00",
        qty_available: 100,
        qty_reserved: 0,
        qty_sold: 0,
        qty_refunded: 0,
        qty_checked_in: 0,
      };
      rows.push(row);
      return HttpResponse.json(row, { status: 201 });
    }),
  );
  await editor();
  await userEvent.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  await screen.findByRole("heading", { name: "Edit event" });
  await userEvent.click(
    screen.getByRole("button", { name: "Add ticket type" }),
  );
  fireEvent.change(screen.getByLabelText("Ticket name", { exact: true }), {
    target: { value: "Paid regression" },
  });
  fireEvent.change(
    screen.getByLabelText("Price (KZT; 0 for free)", { exact: true }),
    {
      target: { value: "25.00" },
    },
  );
  await userEvent.click(
    screen.getByRole("button", { name: "Save ticket type" }),
  );
  await screen.findByRole("rowheader", { name: "Paid regression" });
  expect(savedBody).toMatchObject({
    price_amount: 2500,
    is_free: false,
    currency: "KZT",
  });
  await userEvent.click(
    screen.getByRole("button", { name: "Edit ticket type" }),
  );
  expect(
    (
      screen.getByLabelText("Price (KZT; 0 for free)", {
        exact: true,
      }) as HTMLInputElement
    ).value,
  ).toBe("25.00");
});
it("opens public event details with the live P3 availability envelope", async () => {
  server.use(
    http.get("*/api/v1/events/:id/availability", () =>
      HttpResponse.json({
        event_id: demoEventId,
        registration_open: true,
        ticket_types: [
          {
            id: "p3-paid",
            name: "Live paid admission",
            is_free: false,
            price_amount: "250000.00",
            currency: "KZT",
            max_per_order: 2,
            quantity_available: 5,
            sales_open: true,
          },
        ],
      }),
    ),
  );
  render(
    <SessionContext.Provider value={await publicPageSession()}>
      <MemoryRouter initialEntries={[`/events/${demoEventId}`]}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={<EventDetail locale="en" />}
          />
        </Routes>
      </MemoryRouter>
      ,
    </SessionContext.Provider>,
  );
  await screen.findByText("Live paid admission");
  expect(screen.getByText(/2,500\.00/)).toBeDefined();
  expect(screen.getByRole("link", { name: "Registration" })).toBeDefined();
});
it("shows a recoverable error for malformed availability instead of crashing event details", async () => {
  server.use(
    http.get("*/api/v1/events/:id/availability", () =>
      HttpResponse.json({ registration_open: true, ticket_types: null }),
    ),
  );
  render(
    <SessionContext.Provider value={await publicPageSession()}>
      <MemoryRouter initialEntries={[`/events/${demoEventId}`]}>
        <Routes>
          <Route
            path="/events/:eventId"
            element={<EventDetail locale="en" />}
          />
        </Routes>
      </MemoryRouter>
      ,
    </SessionContext.Provider>,
  );
  await screen.findByRole("alert");
  expect(screen.getByRole("heading", { level: 1 })).toBeDefined();
  await userEvent.click(screen.getByRole("button", { name: "Try again" }));
});
it("validates event discovery before rendering malformed dates or images", async () => {
  server.use(
    http.get("*/api/v1/events", () =>
      HttpResponse.json({
        items: [{ id: "bad", starts_at: "not-a-date" }],
        total: 1,
        limit: 12,
        offset: 0,
      }),
    ),
  );
  render(
    <SessionContext.Provider value={await publicPageSession()}>
      <MemoryRouter>
        <EventList locale="en" />
      </MemoryRouter>
      ,
    </SessionContext.Provider>,
  );
  await screen.findByRole("alert");
  expect(
    screen.getByRole("heading", { name: "Discover events" }),
  ).toBeDefined();
});
