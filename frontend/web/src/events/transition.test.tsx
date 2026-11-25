// @vitest-environment jsdom
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  it,
  expect,
  vi,
} from "vitest";
import {
  render,
  screen,
  fireEvent,
  cleanup,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { setupServer } from "msw/node";
import { createSession, createMemoryTokenStore } from "@biletflow/shared";
import { handlers } from "../mocks/handlers";
import { resetAuthMocks } from "../mocks/auth";
import { resetEventMocks } from "../mocks/events";
import { SessionContext } from "../auth/session";
import { EventEditor } from "./Editor";
const navigate = vi.hoisted(() => vi.fn());
// Hold navigation at its handoff so the outgoing form can be inspected. The
// existing editor journey tests exercise the real router and destination read.
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetAuthMocks();
  resetEventMocks();
  navigate.mockClear();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
it("keeps outgoing create controls until the saved-event route takes over", async () => {
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
        <EventEditor locale="en" />
      </MemoryRouter>
    </SessionContext.Provider>,
  );
  const fill = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label, { exact: true }), {
      target: { value },
    });
  fill("Title", "Transition regression");
  fill("Description", "Demo");
  fill("Category", "student");
  await screen.findByRole("option", {
    name: "Demo campus auditorium · Astana · Demo venue address",
  });
  fill("Venue", "4aab9cc5-d54c-47e8-9b53-09085463ce4c");
  fill("Starts", "2027-02-01T18:00");
  fill("Ends", "2027-02-01T20:00");
  await userEvent.click(
    screen.getByRole("button", { name: "Save draft / changes" }),
  );
  await waitFor(() => expect(navigate).toHaveBeenCalledOnce());
  expect(navigate.mock.calls[0]?.[0]).toMatch(
    /^\/organizer\/events\/[^/]+\/edit$/,
  );
  expect(screen.getByRole("heading", { name: "Create event" })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Edit event" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Add ticket type" })).toBeNull();
});
