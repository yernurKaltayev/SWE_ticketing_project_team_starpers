import { describe, expect, it, vi } from "vitest";
import { createSession } from "../src/session";
import { createMemoryTokenStore } from "../src/token-store";
import type { TokenPair } from "../src/token-store";

const user = {
  id: "user-1",
  email: "owner@example.test",
  full_name: "Owner",
  phone: null,
  role: "organizer",
  email_verified_at: "2026-11-05T00:00:00Z",
};
const tokens = {
  access_token: "access-1",
  refresh_token: "refresh-1",
  token_type: "bearer",
};
const rotated = {
  access_token: "access-2",
  refresh_token: "refresh-2",
  token_type: "bearer",
};
const login = { email: user.email, password: "test-only-password" };
const unauthorized = () =>
  Response.json({ code: "unauthorized" }, { status: 401 });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(
  handler?: (path: string, init?: RequestInit) => Response | Promise<Response>,
) {
  const store = createMemoryTokenStore();
  const cleared = vi.fn();
  const transport = vi.fn<typeof fetch>(async (input, init) => {
    const path = new URL(String(input)).pathname;
    if (handler) return handler(path, init);
    if (path === "/api/v1/auth/login") return Response.json(tokens);
    if (path === "/api/v1/me") return Response.json(user);
    return new Response(null, { status: 204 });
  });
  const session = createSession({
    baseUrl: "https://api.example.test",
    tokenStore: store,
    fetch: transport,
    onClear: cleared,
  });
  return { session, store, transport, cleared };
}

describe("session lifecycle", () => {
  it("initializes a fresh browser signed out and only authenticates after /me", async () => {
    const me = deferred<Response>();
    const { session, store, transport } = setup((path) =>
      path.endsWith("/login") ? Response.json(tokens) : me.promise,
    );
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    await session.initialize();
    expect(session.getSnapshot()).toEqual({
      status: "signedOut",
      user: null,
      reason: null,
    });
    expect(transport).not.toHaveBeenCalled();
    const signingIn = session.login(login);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    expect(session.getSnapshot().status).toBe("loading");
    me.resolve(Response.json(user));
    await expect(signingIn).resolves.toEqual(user);
    expect(session.getSnapshot()).toEqual({
      status: "authenticated",
      user,
      reason: null,
    });
    expect(await store.get()).toEqual({
      accessToken: "access-1",
      refreshToken: "refresh-1",
    });
    expect(
      new Headers(transport.mock.calls[1]![1]?.headers).get("Authorization"),
    ).toBe("Bearer access-1");
    unsubscribe();
    const calls = listener.mock.calls.length;
    session.updateUser({ ...user, full_name: "Updated" });
    expect(listener).toHaveBeenCalledTimes(calls);
  });

  it("deduplicates concurrent refreshes and replays safe reads with the rotated access token", async () => {
    const refresh = deferred<Response>();
    const { session, transport, store } = setup((path, init) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      if (path.endsWith("/refresh")) return refresh.promise;
      return new Headers(init?.headers).get("Authorization") ===
        "Bearer access-1"
        ? unauthorized()
        : Response.json({ value: path });
    });
    await session.login(login);
    const first = session.request("/api/v1/protected/one");
    const second = session.request("/api/v1/protected/two");
    await vi.waitFor(() =>
      expect(
        transport.mock.calls.filter(([url]) =>
          String(url).endsWith("/refresh"),
        ),
      ).toHaveLength(1),
    );
    refresh.resolve(Response.json(rotated));
    await expect(first).resolves.toEqual({ value: "/api/v1/protected/one" });
    await expect(second).resolves.toEqual({ value: "/api/v1/protected/two" });
    expect(await store.get()).toEqual({
      accessToken: "access-2",
      refreshToken: "refresh-2",
    });
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/refresh")),
    ).toHaveLength(1);
  });

  it("does not spend a token twice when another old-token 401 arrives after rotation", async () => {
    const delayed = deferred<Response>();
    const { session, transport } = setup((path, init) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      if (path.endsWith("/refresh")) return Response.json(rotated);
      if (new Headers(init?.headers).get("Authorization") === "Bearer access-2")
        return Response.json({ ok: true });
      if (path.endsWith("/delayed")) return delayed.promise;
      return unauthorized();
    });
    await session.login(login);
    const slow = session.request("/api/v1/delayed");
    await session.request("/api/v1/fast");
    delayed.resolve(unauthorized());
    await expect(slow).resolves.toEqual({ ok: true });
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/refresh")),
    ).toHaveLength(1);
  });

  it("recovers expired credentials without silently replaying a mutation", async () => {
    const { session, transport } = setup((path) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      if (path.endsWith("/refresh")) return Response.json(rotated);
      return unauthorized();
    });
    await session.login(login);
    await expect(
      session.request("/api/v1/change", {
        method: "PATCH",
        body: { name: "New" },
      }),
    ).rejects.toMatchObject({ code: "request_not_replayed" });
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/change")),
    ).toHaveLength(1);
    expect(session.getSnapshot().status).toBe("authenticated");
  });

  it("discards an uncertain refresh and never automatically retries its spent credential", async () => {
    const { session, store, transport, cleared } = setup((path) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      if (path.endsWith("/refresh"))
        throw new TypeError("connection lost after send");
      return unauthorized();
    });
    await session.login(login);
    await expect(session.request("/api/v1/first")).rejects.toMatchObject({
      code: "network_error",
    });
    await expect(session.request("/api/v1/second")).rejects.toMatchObject({
      code: "session_changed",
    });
    expect(session.getSnapshot()).toEqual({
      status: "signedOut",
      user: null,
      reason: "expired",
    });
    expect(await store.get()).toBeNull();
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/refresh")),
    ).toHaveLength(1);
    expect(cleared).toHaveBeenCalledTimes(2);
  });

  it("stops after one safe replay if the rotated credential is also rejected", async () => {
    const { session, transport, store } = setup((path) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      if (path.endsWith("/refresh")) return Response.json(rotated);
      return unauthorized();
    });
    await session.login(login);
    await expect(session.request("/api/v1/denied")).rejects.toMatchObject({
      status: 401,
    });
    expect(session.getSnapshot().reason).toBe("expired");
    expect(await store.get()).toBeNull();
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/denied")),
    ).toHaveLength(2);
  });

  it("shows a suspended session without attempting refresh", async () => {
    const { session, transport, store } = setup((path) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      return Response.json({ code: "account_suspended" }, { status: 403 });
    });
    await session.login(login);
    await expect(session.request("/api/v1/blocked")).rejects.toMatchObject({
      code: "account_suspended",
    });
    expect(session.getSnapshot().reason).toBe("suspended");
    expect(await store.get()).toBeNull();
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/refresh")),
    ).toHaveLength(0);
  });

  it("clears local user/cache state even when remote logout fails", async () => {
    const { session, store, cleared, transport } = setup((path) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      throw new TypeError("offline");
    });
    await session.login(login);
    await expect(session.logout()).rejects.toMatchObject({
      code: "network_error",
    });
    expect(session.getSnapshot()).toEqual({
      status: "signedOut",
      user: null,
      reason: null,
    });
    expect(await store.get()).toBeNull();
    expect(cleared).toHaveBeenCalledTimes(2);
    const logoutRequest = transport.mock.calls.find(([url]) =>
      String(url).endsWith("/logout"),
    )!;
    expect(new Headers(logoutRequest[1]?.headers).get("Authorization")).toBe(
      "Bearer access-1",
    );
    expect(logoutRequest[1]?.body).toBe('{"refresh_token":"refresh-1"}');
  });

  it("does not restore a session when login completes after logout", async () => {
    const pending = deferred<Response>();
    const { session, store, transport } = setup((path) =>
      path.endsWith("/login")
        ? pending.promise
        : new Response(null, { status: 204 }),
    );
    const signingIn = session.login(login);
    const caught = signingIn.catch((error: unknown) => error);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(1));
    await session.logout();
    pending.resolve(Response.json(tokens));
    expect(await caught).toMatchObject({ code: "session_changed" });
    expect(session.getSnapshot().status).toBe("signedOut");
    expect(await store.get()).toBeNull();
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/me")),
    ).toHaveLength(0);
  });

  it("revokes a late rotated credential and keeps logout authoritative", async () => {
    const pending = deferred<Response>();
    const { session, store, transport } = setup((path) => {
      if (path.endsWith("/login")) return Response.json(tokens);
      if (path.endsWith("/me")) return Response.json(user);
      if (path.endsWith("/refresh")) return pending.promise;
      return new Response(null, { status: 204 });
    });
    await session.login(login);
    const refreshing = session.refresh().catch((error: unknown) => error);
    await session.logout();
    pending.resolve(Response.json(rotated));
    expect(await refreshing).toMatchObject({ code: "session_changed" });
    expect(session.getSnapshot().status).toBe("signedOut");
    expect(await store.get()).toBeNull();
    expect(
      transport.mock.calls.filter(
        ([url, init]) =>
          String(url).endsWith("/logout") &&
          init?.body === '{"refresh_token":"refresh-2"}',
      ),
    ).toHaveLength(1);
  });

  it("recovers a native persisted refresh token once before /me", async () => {
    const store = createMemoryTokenStore();
    const readRefreshToken = vi.fn(async () => "native-refresh");
    const transport = vi.fn<typeof fetch>(async (input) =>
      String(input).endsWith("/refresh")
        ? Response.json(rotated)
        : Response.json(user),
    );
    const session = createSession({
      baseUrl: "https://api.example.test",
      tokenStore: store,
      readRefreshToken,
      fetch: transport,
    });
    await Promise.all([session.initialize(), session.initialize()]);
    expect(readRefreshToken).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(2);
    expect(transport.mock.calls[0]![1]?.body).toBe(
      '{"refresh_token":"native-refresh"}',
    );
    expect(
      new Headers(transport.mock.calls[1]![1]?.headers).get("Authorization"),
    ).toBe("Bearer access-2");
    expect(session.getSnapshot().user).toEqual(user);
  });

  it("serializes a delayed secure-store write before logout's clear", async () => {
    const pendingWrite = deferred<void>();
    const writeStarted = deferred<void>();
    let persisted: TokenPair | null = null;
    const store = createMemoryTokenStore();
    const session = createSession({
      baseUrl: "https://api.example.test",
      tokenStore: {
        ...store,
        async set(value) {
          writeStarted.resolve();
          await pendingWrite.promise;
          persisted = value;
          await store.set(value);
        },
        async clear() {
          persisted = null;
          await store.clear();
        },
      },
      fetch: vi.fn<typeof fetch>(async (input) =>
        String(input).endsWith("/login")
          ? Response.json(tokens)
          : new Response(null, { status: 204 }),
      ),
    });
    const signingIn = session.login(login).catch((error: unknown) => error);
    await writeStarted.promise;
    const signingOut = session.logout();
    pendingWrite.resolve();
    await signingOut;
    expect(await signingIn).toMatchObject({ code: "session_changed" });
    expect(persisted).toBeNull();
    expect(await store.get()).toBeNull();
  });

  it("ignores an old account's late /me response after another account signs in", async () => {
    const oldMe = deferred<Response>();
    const { session, transport } = setup((path, init) => {
      if (path.endsWith("/login")) {
        return Response.json(
          init?.body === JSON.stringify(login) ? tokens : rotated,
        );
      }
      return new Headers(init?.headers).get("Authorization") ===
        "Bearer access-1"
        ? oldMe.promise
        : Response.json({ ...user, id: "user-2", email: "other@example.test" });
    });
    const first = session.login(login).catch((error: unknown) => error);
    await vi.waitFor(() => expect(transport).toHaveBeenCalledTimes(2));
    await session.login({
      email: "other@example.test",
      password: "other-password",
    });
    oldMe.resolve(Response.json(user));
    expect(await first).toMatchObject({ code: "session_changed" });
    expect(session.getSnapshot().user?.id).toBe("user-2");
  });

  it("clears a rejected native startup credential instead of retrying it", async () => {
    const store = createMemoryTokenStore();
    const clear = vi.spyOn(store, "clear");
    const transport = vi.fn<typeof fetch>(async () => unauthorized());
    const session = createSession({
      baseUrl: "https://api.example.test",
      tokenStore: store,
      readRefreshToken: async () => "expired-native-refresh",
      fetch: transport,
    });
    await Promise.all([session.initialize(), session.initialize()]);
    await session.initialize();
    expect(session.getSnapshot()).toEqual({
      status: "signedOut",
      user: null,
      reason: "expired",
    });
    expect(clear).toHaveBeenCalledTimes(1);
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("leaves login retryable if secure-storage cleanup fails", async () => {
    const store = createMemoryTokenStore();
    const transport = vi.fn<typeof fetch>();
    const session = createSession({
      baseUrl: "https://api.example.test",
      tokenStore: {
        ...store,
        async clear() {
          throw new Error("secure storage unavailable");
        },
      },
      fetch: transport,
    });
    await expect(session.login(login)).rejects.toThrow(
      "secure storage unavailable",
    );
    expect(session.getSnapshot()).toEqual({
      status: "signedOut",
      user: null,
      reason: null,
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("attempts remote revocation even if local secure-storage deletion fails", async () => {
    const store = createMemoryTokenStore();
    let rejectClear = false;
    const transport = vi.fn<typeof fetch>(async (input) => {
      if (String(input).endsWith("/login")) return Response.json(tokens);
      if (String(input).endsWith("/me")) return Response.json(user);
      return new Response(null, { status: 204 });
    });
    const session = createSession({
      baseUrl: "https://api.example.test",
      tokenStore: {
        ...store,
        async clear() {
          await store.clear();
          if (rejectClear) throw new Error("delete failed");
        },
      },
      fetch: transport,
    });
    await session.login(login);
    rejectClear = true;
    await expect(session.logout()).rejects.toThrow("delete failed");
    expect(session.getSnapshot().status).toBe("signedOut");
    expect(
      transport.mock.calls.filter(([url]) => String(url).endsWith("/logout")),
    ).toHaveLength(1);
  });
});
