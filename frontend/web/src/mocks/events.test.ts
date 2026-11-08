import { afterAll, beforeAll, beforeEach, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { handlers } from "./handlers";
import { resetAuthMocks, mockPassword } from "./auth";
import { demoEventId, resetEventMocks } from "./events";
const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetAuthMocks();
  resetEventMocks();
});
const origin = "http://localhost:5173/api/v1";
async function call(
  path: string,
  token?: string,
  method = "GET",
  body?: unknown,
) {
  return fetch(origin + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function login(email = "organizer@example.com") {
  const r = await call("/auth/login", undefined, "POST", {
    email,
    password: mockPassword,
  });
  return (await r.json()).access_token as string;
}
const event = {
  title: "New free event",
  description: "Test",
  category: "student",
  venue_id: "4aab9cc5-d54c-47e8-9b53-09085463ce4c",
  timezone: "Asia/Almaty",
  starts_at: "2027-02-01T13:00:00Z",
  ends_at: "2027-02-01T15:00:00Z",
  capacity: 10,
  visibility: "public",
  seating_mode: "general_admission",
  layout_id: null,
  registration_opens_at: null,
  registration_closes_at: null,
};
const ticket = {
  name: "Free",
  description: null,
  price_amount: 0,
  quantity_total: 10,
  max_per_order: 2,
  is_hidden: false,
  price_category: null,
  sales_start: null,
  sales_end: null,
};
it("creates draft → rejects missing tickets → adds free type → publishes → discovers → duplicates with reset inventory", async () => {
  const token = await login();
  const created = await call("/events", token, "POST", event);
  expect(created.status).toBe(201);
  const e = await created.json();
  expect((await call(`/events/${e.id}`)).status).toBe(404);
  expect(
    (await (await call(`/events/${e.id}/publish`, token, "POST")).json()).code,
  ).toBe("event_requires_ticket_type");
  expect(
    (await call(`/events/${e.id}/ticket-types`, token, "POST", ticket)).status,
  ).toBe(201);
  expect((await call(`/events/${e.id}/publish`, token, "POST")).status).toBe(
    200,
  );
  const publicEvents = await (
    await call("/events?limit=12&q=New&city=Astana")
  ).json();
  expect(publicEvents.items).toHaveLength(1);
  expect(publicEvents.items[0].share_token).toBe("");
  const clone = await (
    await call(`/events/${e.id}/duplicate`, token, "POST")
  ).json();
  expect(clone.status).toBe("draft");
  expect(clone.id).not.toBe(e.id);
  const copied = await (
    await call(`/events/${clone.id}/ticket-types`, token)
  ).json();
  expect(copied.items[0]).toMatchObject({
    available: 10,
    sold: 0,
    reserved: 0,
    checked_in: 0,
  });
  expect((await (await call(`/events/${e.id}`)).json()).status).toBe(
    "published",
  );
});
it("does not leak private/draft events to another organizer or attendee", async () => {
  const token = await login();
  const e = await (
    await call("/events", token, "POST", { ...event, visibility: "private" })
  ).json();
  const attendee = await login("attendee@example.com");
  expect((await call(`/events/${e.id}`, attendee)).status).toBe(404);
  expect((await call(`/events/${e.id}/ticket-types`, attendee)).status).toBe(
    403,
  );
  await call("/auth/register", undefined, "POST", {
    email: "second@example.com",
    password: mockPassword,
    full_name: "Other organizer",
    role: "organizer",
  });
  await call("/auth/verify-email", undefined, "POST", {
    token: "mock-verify-second%40example.com",
  });
  const other = await login("second@example.com");
  expect((await call(`/events/${e.id}`, other)).status).toBe(404);
  expect(
    (await call(`/events/${e.id}`, other, "PATCH", { title: "Intrusion" }))
      .status,
  ).toBe(403);
});
it("checks capacity and excludes hidden types from public availability", async () => {
  const token = await login();
  const e = await (await call("/events", token, "POST", event)).json();
  const type = await (
    await call(`/events/${e.id}/ticket-types`, token, "POST", {
      ...ticket,
      quantity_total: 11,
    })
  ).json();
  expect(
    (await (await call(`/events/${e.id}/publish`, token, "POST")).json()).code,
  ).toBe("capacity_below_ticket_quantity");
  await call(`/events/${e.id}/ticket-types/${type.id}`, token, "PATCH", {
    ...ticket,
    is_hidden: true,
  });
  await call(`/events/${e.id}/publish`, token, "POST");
  expect(await (await call(`/events/${e.id}/availability`)).json()).toEqual([]);
  await call(`/events/${demoEventId}/unpublish`, token, "POST");
  expect((await call(`/events/${demoEventId}`)).status).toBe(404);
});

it("cancels only after server confirmation and keeps the owner record readable", async () => {
  const token = await login();
  const e = await (await call("/events", token, "POST", event)).json();
  const result = await call(`/events/${e.id}/cancel`, token, "POST");
  expect(result.status).toBe(200);
  expect((await result.json()).status).toBe("cancelled");
  expect((await (await call(`/events/${e.id}`, token)).json()).status).toBe(
    "cancelled",
  );
  expect((await call(`/events/${e.id}/publish`, token, "POST")).status).toBe(
    409,
  );
});
