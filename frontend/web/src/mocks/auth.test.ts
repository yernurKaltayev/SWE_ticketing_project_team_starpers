import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { setupServer } from "msw/node";
import { expireMockAccessTokens, mockPassword, resetAuthMocks } from "./auth";
import { handlers, setScenario } from "./handlers";

const server = setupServer(...handlers);
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterAll(() => server.close());
beforeEach(() => {
  resetAuthMocks();
  setScenario("success");
});
const origin = "http://localhost:5173/api/v1";
function post(path: string, data: unknown, accessToken?: string) {
  return fetch(`${origin}${path}`, {
    method: "POST",
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}
async function login(email = "organizer@example.com", password = mockPassword) {
  const response = await post("/auth/login", { email, password });
  return response.json() as Promise<{
    access_token: string;
    refresh_token: string;
  }>;
}
function authorized(
  path: string,
  token: string,
  method = "GET",
  data?: unknown,
) {
  return fetch(`${origin}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    ...(data === undefined ? {} : { body: JSON.stringify(data) }),
  });
}

describe("F1 development auth fixtures (no live backend evidence)", () => {
  it("registers without a session, requires single-use verification and creates an organizer profile", async () => {
    const email = "new@example.com";
    const registered = await post("/auth/register", {
      email,
      password: mockPassword,
      full_name: "New organizer",
      role: "organizer",
    });
    expect(registered.status).toBe(201);
    expect(await registered.json()).toMatchObject({
      email,
      email_verified_at: null,
    });
    expect(
      (await post("/auth/login", { email, password: mockPassword })).status,
    ).toBe(403);
    expect(
      (
        await post("/auth/verify-email", {
          token: `mock-verify-${encodeURIComponent(email)}`,
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post("/auth/verify-email", {
          token: `mock-verify-${encodeURIComponent(email)}`,
        })
      ).status,
    ).toBe(422);
    const credentials = await login(email);
    const profile = await authorized(
      "/organizers/me",
      credentials.access_token,
    );
    expect(await profile.json()).toMatchObject({
      organization_name: "New organizer",
      contact_email: email,
      contact_phone: "",
    });
  });

  it("rotates refresh credentials and revokes all refresh sessions on reuse", async () => {
    const initial = await login();
    expireMockAccessTokens();
    expect((await authorized("/me", initial.access_token)).status).toBe(401);
    const refreshed = await post("/auth/refresh", {
      refresh_token: initial.refresh_token,
    });
    expect(refreshed.status).toBe(200);
    const rotated = await refreshed.json();
    expect((await authorized("/me", rotated.access_token)).status).toBe(200);
    expect(
      (await post("/auth/refresh", { refresh_token: initial.refresh_token }))
        .status,
    ).toBe(401);
    expect(
      (await post("/auth/refresh", { refresh_token: rotated.refresh_token }))
        .status,
    ).toBe(401);
  });

  it("requires bearer credentials for normal profile calls and confines organizer profile to organizers", async () => {
    expect((await fetch(`${origin}/me`)).status).toBe(401);
    const attendee = await login("attendee@example.com");
    const denied = await authorized("/organizers/me", attendee.access_token);
    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ code: "insufficient_role" });
    const organizer = await login();
    const before = await (
      await authorized("/me", organizer.access_token)
    ).json();
    const patched = await authorized("/me", organizer.access_token, "PATCH", {
      phone: "+77000000000",
    });
    expect(await patched.json()).toMatchObject({
      full_name: before.full_name,
      phone: "+77000000000",
    });
    expect(
      (
        await authorized("/me", organizer.access_token, "PATCH", {
          full_name: null,
        })
      ).status,
    ).toBe(422);
    const cleared = await authorized("/me", organizer.access_token, "PATCH", {
      phone: null,
    });
    expect(await cleared.json()).toMatchObject({ phone: null });
    expect(
      (
        await authorized("/organizers/me", organizer.access_token, "PATCH", {
          contact_phone: null,
        })
      ).status,
    ).toBe(422);
  });

  it("matches the backend's case-insensitive account email identity", async () => {
    const credentials = await login("ORGANIZER@example.com");
    expect((await authorized("/me", credentials.access_token)).status).toBe(
      200,
    );
    const duplicate = await post("/auth/register", {
      email: "ORGANIZER@example.com",
      password: mockPassword,
      full_name: "Duplicate",
      role: "organizer",
    });
    expect(duplicate.status).toBe(409);
    expect(await duplicate.json()).toMatchObject({ code: "email_taken" });
  });

  it("keeps password recovery generic, consumes reset links and revokes refresh sessions", async () => {
    const existing = await post("/auth/forgot-password", {
      email: "organizer@example.com",
    });
    const unknown = await post("/auth/forgot-password", {
      email: "unknown@example.com",
    });
    expect(await existing.json()).toEqual(await unknown.json());
    const initial = await login();
    const token = "mock-reset-organizer%40example.com";
    expect(
      (
        await post("/auth/reset-password", {
          token,
          new_password: "UpdatedPassword123",
        })
      ).status,
    ).toBe(200);
    expect(
      (
        await post("/auth/reset-password", {
          token,
          new_password: "UpdatedPassword123",
        })
      ).status,
    ).toBe(422);
    expect(
      (await post("/auth/refresh", { refresh_token: initial.refresh_token }))
        .status,
    ).toBe(401);
    expect(
      (
        await post("/auth/login", {
          email: "organizer@example.com",
          password: mockPassword,
        })
      ).status,
    ).toBe(401);
    expect(
      (
        await post("/auth/login", {
          email: "organizer@example.com",
          password: "UpdatedPassword123",
        })
      ).status,
    ).toBe(200);
  });

  it("provides suspended, unverified, invalid-link and retry-after responses", async () => {
    for (const [email, code] of [
      ["suspended@example.com", "account_suspended"],
      ["unverified@example.com", "email_not_verified"],
      ["unknown@example.com", "invalid_credentials"],
    ]) {
      const response = await post("/auth/login", {
        email,
        password: mockPassword,
      });
      expect(await response.json()).toMatchObject({ code });
    }
    const limited = await post("/auth/login", {
      email: "rate-limited@example.com",
      password: mockPassword,
    });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("60");
    const invalid = await post("/auth/verify-email", { token: "expired" });
    expect(await invalid.json()).toMatchObject({ code: "invalid_email_token" });
  });

  it("revokes the refresh token on logout and preserves isolated F0 mutation scenarios", async () => {
    const initial = await login();
    expect(
      (
        await post(
          "/auth/logout",
          { refresh_token: initial.refresh_token },
          initial.access_token,
        )
      ).status,
    ).toBe(204);
    expect(
      (await post("/auth/refresh", { refresh_token: initial.refresh_token }))
        .status,
    ).toBe(401);
    const mutation = () =>
      fetch(`${origin}/me`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "X-BiletFlow-Foundation": "true",
        },
        body: JSON.stringify({ full_name: "F0 organizer", phone: null }),
      });
    expect((await mutation()).status).toBe(200);
    setScenario("validation");
    expect((await mutation()).status).toBe(422);
  });
});
