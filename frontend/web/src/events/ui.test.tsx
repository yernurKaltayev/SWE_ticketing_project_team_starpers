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
import { resetEventMocks } from "../mocks/events";
import { SessionContext } from "../auth/session";
import { EventEditor } from "./Editor";
import { EventDetail } from "./Detail";
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
  await user.click(
    screen.getByRole("button", { name: "Publish" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm" }),
  );
  await screen.findByText("Add a ticket type before publishing.");
  await user.click(screen.getByRole("button", { name: "Add ticket type" }));
  fireEvent.change(screen.getByLabelText("Ticket name", { exact: true }), {
    target: { value: "Free admission" },
  });
  await user.click(screen.getByRole("button", { name: "Save ticket type" }));
  await screen.findByRole("rowheader", { name: "Free admission" });
  await user.click(
    screen.getByRole("button", { name: "Publish" }),
  );
  await user.click(
    screen.getByRole("button", { name: "Confirm" }),
  );
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
