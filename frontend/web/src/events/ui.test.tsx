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
import { delay, http, HttpResponse } from "msw";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { createMemoryTokenStore, createSession } from "@biletflow/shared";
import { handlers } from "../mocks/handlers";
import { resetAuthMocks } from "../mocks/auth";
import {
  demoEventId,
  mockCheckoutEvent,
  resetEventMocks,
} from "../mocks/events";
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
  await screen.findByRole("option", {
    name: "Demo campus auditorium · Astana · Demo venue address",
  });
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
  let destinationLoaded = false;
  server.use(
    http.get("*/api/v1/events/:id", async ({ params }) => {
      // Model a slower destination read: editing must begin only after this
      // request completes, never from transient state on the create route.
      await delay(150);
      const context = mockCheckoutEvent(String(params.id));
      destinationLoaded = true;
      return context
        ? HttpResponse.json(context.event)
        : new HttpResponse(null, { status: 404 });
    }),
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
  expect(destinationLoaded).toBe(true);
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
  // The edit column names the ticket-type action, not the event.
  expect(screen.getByRole("columnheader", { name: "Edit ticket type" })).toBeTruthy();
  expect(screen.queryByRole("columnheader", { name: "Edit event" })).toBeNull();
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
  // Whole tenge drop the ".00"; the price shows in the panel and the phone CTA.
  expect(screen.getAllByText(/KZT 2,500$/).length).toBeGreaterThan(0);
  expect(screen.queryByText(/2,500\.00/)).toBeNull();
  expect(
    screen.getAllByRole("link", { name: "Registration" }).length,
  ).toBeGreaterThan(0);
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

function recordPosts() {
  const posts: { path: string; body: unknown }[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method !== "POST") return;
    const path = new URL(request.url).pathname;
    if (path === "/api/v1/venues" || path === "/api/v1/events")
      posts.push({ path, body: await request.clone().json() });
  });
  return posts;
}

it("creates a new venue chosen from the list, then saves the event at it", async () => {
  const posts = recordPosts();
  const { fill } = await editor();
  fill("Venue", "__new__");
  fill("Venue name", "Abay Opera House");
  fill("Venue address", "Abay Ave 110");
  fill("Venue city", "Almaty");
  await userEvent.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  await screen.findByRole("heading", { name: "Edit event" });
  const [venuePost, eventPost] = posts;
  expect(venuePost).toEqual({
    path: "/api/v1/venues",
    body: { name: "Abay Opera House", address: "Abay Ave 110", city: "Almaty" },
  });
  expect(eventPost?.path).toBe("/api/v1/events");
  const created = (eventPost!.body as { venue_id: string }).venue_id;
  expect(created).not.toBe("4aab9cc5-d54c-47e8-9b53-09085463ce4c");
  expect(created).not.toBe("new");
  await waitFor(() =>
    expect(
      (screen.getByLabelText("Venue", { exact: true }) as HTMLSelectElement)
        .selectedOptions[0]?.textContent,
    ).toBe("Abay Opera House · Almaty · Abay Ave 110"),
  );
  server.events.removeAllListeners();
});

it("reuses a saved venue entered again as new without creating a copy", async () => {
  const posts = recordPosts();
  const { fill } = await editor();
  fill("Venue", "__new__");
  fill("Venue name", "demo campus auditorium");
  fill("Venue address", "Demo venue address");
  fill("Venue city", "astana");
  await userEvent.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  await screen.findByRole("heading", { name: "Edit event" });
  expect(posts.map((p) => p.path)).toEqual(["/api/v1/events"]);
  expect((posts[0]!.body as { venue_id: string }).venue_id).toBe(
    "4aab9cc5-d54c-47e8-9b53-09085463ce4c",
  );
  server.events.removeAllListeners();
});

it("asks for the address and city of a new venue before sending anything", async () => {
  const posts = recordPosts();
  const { fill } = await editor();
  fill("Venue", "__new__");
  fill("Venue name", "Abay Opera House");
  expect(
    screen.getByText(
      "New venue. Add its name, address and city; it will be saved to the venue list.",
    ),
  ).toBeTruthy();
  fireEvent.submit(
    screen.getByRole("button", { name: "Save draft / changes" }).closest("form")!,
  );
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Venue address");
  expect(posts).toEqual([]);
  server.events.removeAllListeners();
});
