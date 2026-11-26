// @vitest-environment jsdom
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setupServer } from "msw/node";
import { createMemoryTokenStore, createSession } from "@biletflow/shared";
import { SessionContext } from "../auth/session";
import { handlers } from "../mocks/handlers";
import { resetAuthMocks } from "../mocks/auth";
import { demoEventId, resetEventMocks } from "../mocks/events";
import { resetStaffMocks } from "../mocks/staff";
import StaffPage from "./StaffPage";

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
  resetStaffMocks();
});

async function mount(email = "organizer@example.com") {
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
        <MemoryRouter initialEntries={[`/organizer/events/${demoEventId}/staff`]}>
          <Routes>
            <Route
              path="/organizer/events/:eventId/staff"
              element={<StaffPage locale="en" />}
            />
          </Routes>
        </MemoryRouter>
      </SessionContext.Provider>
    </QueryClientProvider>,
  );
}

it("adds a check-in staff member by email and lists them", async () => {
  const user = userEvent.setup();
  await mount();
  expect(await screen.findByText("No staff assigned yet.")).toBeTruthy();

  await user.type(screen.getByLabelText("Account email"), "ATTENDEE@example.com");
  await user.click(screen.getByRole("button", { name: "Add to staff" }));

  expect(await screen.findByText("Staff member added.")).toBeTruthy();
  const row = await screen.findByRole("row", { name: /attendee@example.com/ });
  expect(within(row).getByText("Check-in")).toBeTruthy();
});

it("explains unknown accounts and duplicates without adding anyone", async () => {
  const user = userEvent.setup();
  await mount();
  await screen.findByText("No staff assigned yet.");

  await user.type(screen.getByLabelText("Account email"), "nobody@example.com");
  await user.click(screen.getByRole("button", { name: "Add to staff" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /No BiletFlow account uses this email/,
  );

  const email = screen.getByLabelText("Account email");
  await user.clear(email);
  await user.type(email, "attendee@example.com");
  await user.click(screen.getByRole("button", { name: "Add to staff" }));
  await screen.findByRole("row", { name: /attendee@example.com/ });
  await user.type(screen.getByLabelText("Account email"), "attendee@example.com");
  await user.click(screen.getByRole("button", { name: "Add to staff" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/already on this event/);
});

it("validates the email before calling the server", async () => {
  const user = userEvent.setup();
  await mount();
  await screen.findByText("No staff assigned yet.");
  await user.type(screen.getByLabelText("Account email"), "not-an-email");
  await user.click(screen.getByRole("button", { name: "Add to staff" }));
  expect(await screen.findByText("Enter a valid email address")).toBeTruthy();
  expect(screen.getByText("No staff assigned yet.")).toBeTruthy();
});

it("removes a staff member only after confirmation", async () => {
  const user = userEvent.setup();
  await mount();
  await screen.findByText("No staff assigned yet.");
  await user.type(screen.getByLabelText("Account email"), "attendee@example.com");
  await user.click(screen.getByRole("radio", { name: /Support/ }));
  await user.click(screen.getByRole("button", { name: "Add to staff" }));
  const row = await screen.findByRole("row", { name: /attendee@example.com/ });
  expect(within(row).getByText("Support")).toBeTruthy();

  await user.click(within(row).getByRole("button", { name: /Remove/ }));
  await user.click(within(row).getByRole("button", { name: "Cancel" }));
  expect(screen.getByRole("row", { name: /attendee@example.com/ })).toBeTruthy();

  await user.click(
    within(screen.getByRole("row", { name: /attendee@example.com/ })).getByRole(
      "button",
      { name: /Remove/ },
    ),
  );
  await user.click(screen.getByRole("button", { name: "Remove access" }));
  expect(await screen.findByText("Staff member removed.")).toBeTruthy();
  expect(await screen.findByText("No staff assigned yet.")).toBeTruthy();
});

it("refuses other accounts", async () => {
  await mount("attendee@example.com");
  expect((await screen.findByRole("alert")).textContent).toMatch(
    /Only the organizer or a manager/,
  );
});

it("creates a volunteer and shows the generated sign-in details once", async () => {
  const user = userEvent.setup();
  await mount();
  expect(await screen.findByText("No volunteers yet.")).toBeTruthy();

  await user.click(screen.getByRole("button", { name: "Create volunteer" }));
  expect(await screen.findByText("Enter the volunteer's name")).toBeTruthy();

  await user.type(screen.getByLabelText("Volunteer's name"), "Aru Nurlan");
  await user.click(screen.getByRole("button", { name: "Create volunteer" }));

  const details = await screen.findByRole("region", { name: /Sign-in details for Aru Nurlan/ });
  expect(within(details).getByText("v-mock1@volunteers.biletflow.kz")).toBeTruthy();
  expect(within(details).getByText("mock-pass-1")).toBeTruthy();
  const row = await screen.findByRole("row", { name: /Aru Nurlan/ });
  expect(within(row).getByText("Never")).toBeTruthy();
  expect(within(row).queryByText("mock-pass-1")).toBeNull();

  await user.click(within(details).getByRole("button", { name: "Done" }));
  expect(screen.queryByText("mock-pass-1")).toBeNull();
  // Volunteers are not mixed into the staff list.
  expect(screen.getByText("No staff assigned yet.")).toBeTruthy();
});

it("issues a new volunteer password and deletes the account after confirmation", async () => {
  const user = userEvent.setup();
  await mount();
  await screen.findByText("No volunteers yet.");
  await user.type(screen.getByLabelText("Volunteer's name"), "Dana");
  await user.click(screen.getByRole("button", { name: "Create volunteer" }));
  await screen.findByText("mock-pass-1");

  await user.click(screen.getByRole("button", { name: "New password: Dana" }));
  expect(await screen.findByText("mock-pass-2")).toBeTruthy();
  expect(screen.getByRole("status").textContent).toMatch(/New password issued/);

  await user.click(screen.getByRole("button", { name: "Delete: Dana" }));
  await user.click(screen.getByRole("button", { name: "Delete account" }));
  expect(await screen.findByText("Volunteer account deleted.")).toBeTruthy();
  expect(await screen.findByText("No volunteers yet.")).toBeTruthy();
  expect(screen.queryByText("mock-pass-2")).toBeNull();
});
