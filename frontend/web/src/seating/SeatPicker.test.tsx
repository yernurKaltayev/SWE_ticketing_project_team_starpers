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
import { setupServer } from "msw/node";
import { http, HttpResponse } from "msw";
import { createApiClient } from "@biletflow/shared";
import { authHandlers, resetAuthMocks, mockPassword } from "../mocks/auth";
import {
  seatingHandlers,
  resetSeatingMocks,
  seatingDemoOffers,
} from "../mocks/seating";
import { SeatPicker } from "./SeatPicker";
const baseUrl = "http://localhost:5173";
const server = setupServer(...seatingHandlers, ...authHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetSeatingMocks();
  resetAuthMocks();
});
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
async function client() {
  const r = await fetch(baseUrl + "/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "organizer@example.com",
      password: mockPassword,
    }),
  });
  const { access_token } = await r.json();
  return createApiClient({ baseUrl, getAccessToken: () => access_token });
}
it("shows all 52 backend-layout fixture seats without guessing ticket mapping", async () => {
  const api = await client();
  render(<SeatPicker eventId="f5-demo" request={api.request} locale="en" />);
  await screen.findByRole("group", { name: "Seat map" });
  expect(screen.getAllByRole("button", { name: /Available/ })).toHaveLength(
    104,
  );
  expect(
    (
      screen.getAllByRole("button", {
        name: /1 · Available/,
      })[0] as HTMLButtonElement
    ).disabled,
  ).toBe(true);
  expect(screen.getByText(/Seat booking is not yet available/)).toBeTruthy();
});
it("selects by keyboard on SVG, holds through HTTP and releases", async () => {
  const api = await client();
  render(
    <SeatPicker
      eventId="f5-demo"
      request={api.request}
      locale="en"
      offers={seatingDemoOffers}
      onContinue={() => {}}
    />,
  );
  await screen.findByRole("group", { name: "Seat map" });
  fireEvent.change(screen.getByLabelText("Ticket type"), {
    target: { value: "standard" },
  });
  fireEvent.keyDown(
    screen.getByRole("button", { name: "Parterre / A / 1: Available" }),
    { key: "Enter" },
  );
  expect(screen.getByRole("button", { name: /1 · Selected/ })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: /Hold selected seats/ }));
  await screen.findByRole("button", { name: "Release seats" });
  fireEvent.click(screen.getByRole("button", { name: "Release seats" }));
  await waitFor(() =>
    expect(screen.queryByRole("button", { name: "Release seats" })).toBeNull(),
  );
});
it("enforces category/limit and hands off real returned hold IDs", async () => {
  const api = await client();
  const continuation = vi.fn((take) => take());
  render(
    <SeatPicker
      eventId="f5-demo"
      request={api.request}
      locale="en"
      offers={seatingDemoOffers}
      onContinue={continuation}
    />,
  );
  await screen.findByRole("group", { name: "Seat map" });
  fireEvent.change(screen.getByLabelText("Ticket type"), {
    target: { value: "vip" },
  });
  expect(
    screen
      .getByRole("button", { name: "Parterre / A / 1: Available" })
      .getAttribute("aria-disabled"),
  ).toBe("true");
  fireEvent.click(
    screen.getByRole("button", { name: "VIP / V1 / 1: Available" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "VIP / V1 / 2: Available" }),
  );
  fireEvent.click(
    screen.getByRole("button", { name: "VIP / V1 / 3: Available" }),
  );
  expect(
    screen.getByRole("button", { name: "Hold selected seats (2)" }),
  ).toBeTruthy();
  fireEvent.click(
    screen.getByRole("button", { name: "Hold selected seats (2)" }),
  );
  const next = await screen.findByRole("button", {
    name: "Continue with held seats",
  });
  await waitFor(() => expect((next as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(next);
  expect(continuation.mock.results[0]?.value.items[0].seat_ids).toEqual([
    "demo-V1-1",
    "demo-V1-2",
  ]);
});
it("removes obsolete availability on failed reads and offers retry", async () => {
  const api = await client();
  server.use(
    http.get(
      "*/api/v1/events/f5-demo/seat-map",
      () => new HttpResponse(null, { status: 503 }),
    ),
  );
  render(<SeatPicker eventId="f5-demo" request={api.request} locale="ru" />);
  await screen.findByRole("alert");
  expect(screen.queryByRole("group", { name: "Схема мест" })).toBeNull();
  server.resetHandlers();
  fireEvent.click(screen.getByRole("button", { name: "Обновить наличие" }));
  await screen.findByRole("group", { name: "Схема мест" });
});
it("blocks a second hold after a lost response and preserves warning on refresh", async () => {
  const api = await client();
  let posts = 0;
  server.use(
    http.post("*/api/v1/events/f5-demo/holds", () => {
      posts++;
      return HttpResponse.error();
    }),
  );
  render(
    <SeatPicker
      eventId="f5-demo"
      request={api.request}
      locale="en"
      offers={seatingDemoOffers}
      onContinue={() => {}}
    />,
  );
  await screen.findByRole("group", { name: "Seat map" });
  fireEvent.change(screen.getByLabelText("Ticket type"), {
    target: { value: "standard" },
  });
  fireEvent.click(
    screen.getByRole("button", { name: "Parterre / A / 1: Available" }),
  );
  fireEvent.click(screen.getByRole("button", { name: /Hold selected seats/ }));
  await screen.findByText(/The hold result is unknown/);
  fireEvent.click(screen.getByRole("button", { name: "Refresh availability" }));
  expect(
    screen.queryByRole("button", { name: /Hold selected seats/ }),
  ).toBeNull();
  expect(posts).toBe(1);
});
