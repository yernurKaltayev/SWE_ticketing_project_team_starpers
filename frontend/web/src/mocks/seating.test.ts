import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
import { setupServer } from "msw/node";
import { authHandlers, resetAuthMocks, mockPassword } from "./auth";
import { seatingHandlers, resetSeatingMocks } from "./seating";
const server = setupServer(...seatingHandlers, ...authHandlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetAuthMocks();
  resetSeatingMocks();
});
afterEach(() => vi.restoreAllMocks());
const origin = "http://localhost:5173/api/v1/events/f5-demo";
async function token(email: string) {
  const r = await fetch("http://localhost:5173/api/v1/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: mockPassword }),
  });
  return (await r.json()).access_token as string;
}
function reserve(t: string) {
  return fetch(origin + "/holds", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      ticket_type_id: "standard",
      seat_ids: ["demo-A-1"],
    }),
  });
}
it("models one successful claimant, rejects a nonowner release and allows reclaim after release", async () => {
  const [a, b] = await Promise.all([
    token("organizer@example.com"),
    token("attendee@example.com"),
  ]);
  const responses = await Promise.all([reserve(a), reserve(b)]);
  expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
  const index = responses.findIndex((r) => r.status === 201);
  const h = await responses[index]!.json();
  const owner = [a, b][index]!;
  const other = [a, b][1 - index]!;
  const release = (t: string) =>
    fetch(origin + "/holds/" + h.id, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${t}` },
    });
  expect((await release(other)).status).toBe(404);
  expect(
    (await fetch(origin + "/seat-map").then((r) => r.json())).seats[0].status,
  ).toBe("held");
  expect((await release(owner)).status).toBe(204);
  expect((await reserve(other)).status).toBe(201);
});
it("models expiry using the returned server expiry and permits another claimant", async () => {
  const a = await token("organizer@example.com");
  const b = await token("attendee@example.com");
  const h = await reserve(a).then((r) => r.json());
  vi.spyOn(Date, "now").mockReturnValue(Date.parse(h.expires_at) + 1);
  expect(
    (await fetch(origin + "/seat-map").then((r) => r.json())).seats[0].status,
  ).toBe("available");
  expect((await reserve(b)).status).toBe(201);
});
