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

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const rotatedTokens = {
  access_token: "new-access",
  refresh_token: "new-refresh",
  token_type: "bearer",
};

function rotationBackend(
  firstResponse = Promise.resolve(Response.json(rotatedTokens)),
) {
  const firstRotation = deferred<void>();
  const refreshTokens: string[] = [];
  const activeRefreshTokens = new Set(["old-refresh", "unrelated-refresh"]);
  const spentRefreshTokens = new Set<string>();
  const meBearers: (string | null)[] = [];
  const fetch = vi.fn<typeof globalThis.fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (path.endsWith("/refresh")) {
      const token = JSON.parse(String(init?.body)).refresh_token as string;
      refreshTokens.push(token);
      // Match P1: reuse of a spent, unexpired token revokes every user session.
      if (spentRefreshTokens.has(token)) {
        activeRefreshTokens.clear();
        return Response.json(
          { code: "invalid_refresh_token" },
          { status: 401 },
        );
      }
      if (!activeRefreshTokens.delete(token))
        throw new Error("Unexpected refresh credential");
      spentRefreshTokens.add(token);
      if (token === "old-refresh") {
        activeRefreshTokens.add("new-refresh");
        firstRotation.resolve();
        return firstResponse;
      }
      activeRefreshTokens.add("latest-refresh");
      return Response.json({
        access_token: "latest-access",
        refresh_token: "latest-refresh",
        token_type: "bearer",
      });
    }
    if (path.endsWith("/logout")) {
      const token = JSON.parse(String(init?.body)).refresh_token as string;
      activeRefreshTokens.delete(token);
      return new Response(null, { status: 204 });
    }
    if (path.endsWith("/me")) {
      meBearers.push(new Headers(init?.headers).get("Authorization"));
      return Response.json(user);
    }
    throw new Error("Unexpected session request");
  });
  return {
    fetch: fetch as typeof globalThis.fetch,
    firstRotation: firstRotation.promise,
    refreshTokens,
    activeRefreshTokens,
    meBearers,
  };
}

function nativeSession(
  secure: ReturnType<typeof secureStorage>,
  fetch: typeof globalThis.fetch,
) {
  const store = createNativeTokenStore(secure);
  return {
    store,
    session: createSession({
      baseUrl: "http://api.example",
      tokenStore: store,
      readRefreshToken: store.getRefreshToken,
      fetch,
    }),
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

  it("does not replay a spent credential after process death before the refresh response arrives", async () => {
    const secure = secureStorage();
    await createNativeTokenStore(secure).set({
      accessToken: "old-access",
      refreshToken: "old-refresh",
    });
    const response = deferred<Response>();
    const backend = rotationBackend(response.promise);
    const original = nativeSession(secure, backend.fetch);
    const initializing = original.session.initialize();
    await backend.firstRotation;
    try {
      // The old lifecycle is suspended with no response or error handler run.
      // A new controller has only the same durable SecureStore contents.
      const restarted = nativeSession(secure, backend.fetch);
      await restarted.session.initialize();
      expect({
        refreshTokens: backend.refreshTokens,
        unrelatedSessionActive:
          backend.activeRefreshTokens.has("unrelated-refresh"),
        snapshot: restarted.session.getSnapshot(),
        meBearers: backend.meBearers,
        persisted: [...secure.values.values()],
      }).toEqual({
        refreshTokens: ["old-refresh"],
        unrelatedSessionActive: true,
        snapshot: { status: "signedOut", user: null, reason: null },
        meBearers: [],
        persisted: [],
      });
    } finally {
      // Dispose the simulated dead process only after checking the restart.
      await original.session.logout();
      response.resolve(Response.json(rotatedTokens));
      await initializing;
    }
  });

  it("stays signed out after process death while the replacement secure-store write is pending", async () => {
    const secure = secureStorage();
    await createNativeTokenStore(secure).set({
      accessToken: "old-access",
      refreshToken: "old-refresh",
    });
    const writeStarted = deferred<void>();
    const write = deferred<void>();
    secure.setItemAsync = async (key, value) => {
      if (value === "new-refresh") {
        writeStarted.resolve();
        await write.promise;
      }
      secure.values.set(key, value);
    };
    const backend = rotationBackend();
    const original = nativeSession(secure, backend.fetch);
    const initializing = original.session.initialize();
    await writeStarted.promise;
    try {
      const restarted = nativeSession(secure, backend.fetch);
      await restarted.session.initialize();
      expect({
        refreshTokens: backend.refreshTokens,
        unrelatedSessionActive:
          backend.activeRefreshTokens.has("unrelated-refresh"),
        snapshot: restarted.session.getSnapshot(),
        meBearers: backend.meBearers,
        persisted: [...secure.values.values()],
      }).toEqual({
        refreshTokens: ["old-refresh"],
        unrelatedSessionActive: true,
        snapshot: { status: "signedOut", user: null, reason: null },
        meBearers: [],
        persisted: [],
      });
    } finally {
      const loggingOut = original.session.logout();
      write.resolve();
      await Promise.all([initializing, loggingOut]);
    }
  });

  it("recovers with the replacement credential after a completed refresh and a new process", async () => {
    const secure = secureStorage();
    await createNativeTokenStore(secure).set({
      accessToken: "old-access",
      refreshToken: "old-refresh",
    });
    const backend = rotationBackend();
    const original = nativeSession(secure, backend.fetch);
    await original.session.initialize();
    expect([...secure.values.values()]).toEqual(["new-refresh"]);

    const restarted = nativeSession(secure, backend.fetch);
    expect(await restarted.store.getAccessToken()).toBeNull();
    await restarted.session.initialize();
    expect(backend.refreshTokens).toEqual(["old-refresh", "new-refresh"]);
    expect(backend.meBearers).toEqual([
      "Bearer new-access",
      "Bearer latest-access",
    ]);
    expect(restarted.session.getSnapshot()).toEqual({
      status: "authenticated",
      user,
      reason: null,
    });
    expect([...secure.values.values()]).toEqual(["latest-refresh"]);
    expect(backend.activeRefreshTokens.has("unrelated-refresh")).toBe(true);
  });
});
