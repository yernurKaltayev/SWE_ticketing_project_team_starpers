// @vitest-environment jsdom
import { beforeAll, afterAll, beforeEach, afterEach, it, expect } from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  within,
} from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createSession, createMemoryTokenStore } from "@biletflow/shared";
import { handlers } from "../mocks/handlers";
import { resetAuthMocks } from "../mocks/auth";
import {
  resetEventMocks,
  demoEventId,
  mockCheckoutEvent,
} from "../mocks/events";
import { SessionContext } from "../auth/session";
import { SeatingSetup } from "./Pages";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetAuthMocks();
  resetEventMocks();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
async function start(draft = true) {
  const session = createSession({
    baseUrl: "http://localhost:5173",
    tokenStore: createMemoryTokenStore(),
  });
  await session.login({
    email: "organizer@example.com",
    password: "BiletFlow123!",
  });
  const fixture = mockCheckoutEvent(demoEventId)!;
  server.use(
    http.get("*/api/v1/events/:id", () =>
      HttpResponse.json({
        ...fixture.event,
        status: draft ? "draft" : "published",
      }),
    ),
  );
  render(
    <SessionContext.Provider value={session}>
      <MemoryRouter
        initialEntries={[`/organizer/events/${demoEventId}/seating`]}
      >
        <Routes>
          <Route
            path="/organizer/events/:eventId/seating"
            element={<SeatingSetup locale="en" />}
          />
        </Routes>
      </MemoryRouter>
    </SessionContext.Provider>,
  );
  return fixture;
}
it("saves only a layout belonging to the current venue", async () => {
  let body: unknown;
  server.use(
    http.patch("*/api/v1/events/:id", async ({ request }) => {
      body = await request.json();
      return HttpResponse.json({});
    }),
  );
  await start();
  const mode = await screen.findByLabelText("Seating setup");
  fireEvent.change(mode, { target: { value: "assigned" } });
  const select = screen.getByLabelText("Existing venue layout");
  await screen.findByRole("option", { name: "Demo · Standard hall" });
  fireEvent.change(select, {
    target: { value: "ee4c8d20-68f0-4772-9d20-11ab133ec821" },
  });
  fireEvent.click(
    within(mode.closest("form")!).getByRole("button", { name: "Save seating" }),
  );
  await screen.findByText("Seating saved.");
  expect(body).toEqual({
    seating_mode: "assigned",
    layout_id: "ee4c8d20-68f0-4772-9d20-11ab133ec821",
  });
});
it("retains a category after a failed save and supports explicit retry", async () => {
  let attempts = 0;
  const writes: unknown[] = [];
  server.use(
    http.patch(
      "*/api/v1/events/:id/ticket-types/:ticket",
      async ({ request }) => {
        writes.push(await request.json());
        return ++attempts === 1
          ? HttpResponse.json(
              { code: "conflict", message: "conflict" },
              { status: 409 },
            )
          : HttpResponse.json({});
      },
    ),
  );
  await start();
  const category = await screen.findByLabelText("Price category");
  fireEvent.change(category, { target: { value: "vip" } });
  const form = category.closest("form")!;
  fireEvent.click(within(form).getByRole("button"));
  await screen.findByRole("alert");
  expect((category as HTMLInputElement).value).toBe("vip");
  fireEvent.click(within(form).getByRole("button"));
  await screen.findByText("Category saved.");
  expect(writes).toEqual([
    { price_category: "vip" },
    { price_category: "vip" },
  ]);
});
it("prevents seating and category changes for published events", async () => {
  await start(false);
  const mode = await screen.findByLabelText("Seating setup");
  expect(mode.matches(":disabled")).toBe(true);
  const category = await screen.findByLabelText("Price category");
  expect(category.matches(":disabled")).toBe(true);
});
