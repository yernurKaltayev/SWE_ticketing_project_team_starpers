import { describe, expect, it, vi } from "vitest";
import { createSession } from "@biletflow/shared";
import { createNativeTokenStore } from "./token-store";

const user = {
  id: "mobile-user",
  email: "staff@example.com",
  full_name: "Event staff",
  phone: null,
  role: "attendee",
  email_verified_at: "2026-11-05T00:00:00Z",
};

function secureStorage() {
  const values = new Map<string, string>();
  return {
    values,
    async getItemAsync(key: string) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      values.set(key, value);
    },
    async deleteItemAsync(key: string) {
      values.delete(key);
    },
  };
}

describe("native session recovery", () => {
  it("exchanges the persisted refresh credential once before loading /me and clears it on logout", async () => {
    const secure = secureStorage();
    const oldProcess = createNativeTokenStore(secure);
    await oldProcess.set({
      accessToken: "old-access",
      refreshToken: "old-refresh",
    });
    const store = createNativeTokenStore(secure);
    const calls: { path: string; bearer: string | null; body: unknown }[] = [];
    const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname;
      const headers = new Headers(init?.headers);
      calls.push({
        path,
        bearer: headers.get("Authorization"),
        body: init?.body ? JSON.parse(String(init.body)) : null,
      });
      if (path.endsWith("/refresh"))
        return Response.json({
          access_token: "new-access",
          refresh_token: "new-refresh",
          token_type: "bearer",
        });
      if (path.endsWith("/logout")) return new Response(null, { status: 204 });
      return Response.json(user);
    });
    const session = createSession({
      baseUrl: "http://api.example",
      tokenStore: store,
      readRefreshToken: store.getRefreshToken,
      fetch: fetch as typeof globalThis.fetch,
    });
    await Promise.all([session.initialize(), session.initialize()]);
    expect(calls.map(({ path }) => path)).toEqual([
      "/api/v1/auth/refresh",
      "/api/v1/me",
    ]);
    expect(calls[0].body).toEqual({ refresh_token: "old-refresh" });
    expect(calls[0].bearer).toBeNull();
    expect(calls[1].bearer).toBe("Bearer new-access");
    expect(session.getSnapshot().user?.email).toBe(user.email);
    expect([...secure.values.values()]).toEqual(["new-refresh"]);
    await session.logout();
    expect(secure.values.size).toBe(0);
    expect(await store.getAccessToken()).toBeNull();
    expect(session.getSnapshot().status).toBe("signedOut");
    expect(calls[2].body).toEqual({ refresh_token: "new-refresh" });
  });

  it("discards an uncertain rotated credential and requires sign-in instead of retrying it", async () => {
    const secure = secureStorage();
    const store = createNativeTokenStore(secure);
    await store.set({ accessToken: "prior", refreshToken: "spent" });
    const restarted = createNativeTokenStore(secure);
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      throw new TypeError("offline");
    });
    const session = createSession({
      baseUrl: "http://api.example",
      tokenStore: restarted,
      readRefreshToken: restarted.getRefreshToken,
      fetch: fetch as typeof globalThis.fetch,
    });
    await session.initialize();
    await session.initialize();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(secure.values.size).toBe(0);
    expect(session.getSnapshot()).toMatchObject({
      status: "signedOut",
      user: null,
      reason: "expired",
    });
  });
});
