import { ApiError, createApiClient } from "./api-client";
import type { ApiRequestOptions } from "./api-client";
import type { components } from "./generated/api";
import type { TokenPair, TokenStore } from "./token-store";

type User = components["schemas"]["UserOut"];
type Login = components["schemas"]["LoginIn"];
type Tokens = components["schemas"]["TokenOut"];

export interface SessionSnapshot {
  status: "loading" | "signedOut" | "authenticated";
  user: User | null;
  reason: "expired" | "suspended" | null;
}

export interface SessionOptions {
  baseUrl: string;
  tokenStore: TokenStore;
  fetch?: typeof globalThis.fetch;
  /** Native only: read a persisted refresh credential after process restart. */
  readRefreshToken?: () => Promise<string | null>;
  /** Remove user-specific caches whenever the current session is discarded. */
  onClear?: () => void;
}

export interface Session {
  getSnapshot(): SessionSnapshot;
  subscribe(listener: () => void): () => void;
  initialize(): Promise<void>;
  login(data: Login): Promise<User>;
  refresh(): Promise<void>;
  logout(): Promise<void>;
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
  reloadUser(): Promise<User>;
  updateUser(user: User): void;
}

function sessionChanged() {
  return new ApiError(401, "session_changed", "The session has changed.");
}

function tokenPair(data: Tokens): TokenPair {
  if (
    typeof data?.access_token !== "string" ||
    !data.access_token ||
    typeof data.refresh_token !== "string" ||
    !data.refresh_token ||
    (data.token_type !== undefined &&
      (typeof data.token_type !== "string" ||
        data.token_type.toLowerCase() !== "bearer"))
  ) {
    throw new ApiError(200, "invalid_response", "Invalid session credentials.");
  }
  return { accessToken: data.access_token, refreshToken: data.refresh_token };
}

/**
 * One controller per platform session. Refresh tokens are spent once, never
 * retried after an uncertain result. Only GET/HEAD requests are replayed.
 */
export function createSession(options: SessionOptions): Session {
  const publicApi = createApiClient({
    baseUrl: options.baseUrl,
    fetch: options.fetch,
  });
  const listeners = new Set<() => void>();
  let snapshot: SessionSnapshot = {
    status: "loading",
    user: null,
    reason: null,
  };
  let epoch = 0;
  let credentials: TokenPair | null = null;
  let refreshFlight: { epoch: number; promise: Promise<void> } | null = null;
  let initializeFlight: Promise<void> | null = null;
  // SecureStore writes are asynchronous. A queued clear must run after any old
  // write, so a late refresh cannot restore credentials after logout.
  let storageQueue: Promise<void> = Promise.resolve();
  const store = (action: () => Promise<void>): Promise<void> => {
    const result = storageQueue.then(action, action);
    storageQueue = result.catch(() => undefined);
    return result;
  };
  const publish = (next: SessionSnapshot) => {
    snapshot = next;
    for (const listener of listeners) listener();
  };
  const assertCurrent = (expected: number) => {
    if (epoch !== expected) throw sessionChanged();
  };
  const authenticatedApi = (accessToken: string) =>
    createApiClient({
      baseUrl: options.baseUrl,
      fetch: options.fetch,
      getAccessToken: () => accessToken,
    });
  const forget = async (
    expected: number,
    reason: SessionSnapshot["reason"],
  ) => {
    if (epoch !== expected) return;
    epoch += 1;
    credentials = null;
    options.onClear?.();
    publish({ status: "signedOut", user: null, reason });
    await store(() => options.tokenStore.clear());
  };
  const save = async (tokens: TokenPair, expected: number) => {
    assertCurrent(expected);
    await store(async () => {
      assertCurrent(expected);
      await options.tokenStore.set(tokens);
    });
    assertCurrent(expected);
    credentials = tokens;
  };
  const revoke = async (tokens: TokenPair) => {
    await authenticatedApi(tokens.accessToken).request<void>(
      "/api/v1/auth/logout",
      {
        method: "POST",
        body: { refresh_token: tokens.refreshToken },
      },
    );
  };

  const refresh = (): Promise<void> => {
    const expected = epoch;
    if (refreshFlight?.epoch === expected) return refreshFlight.promise;
    const prior = credentials;
    if (!prior?.refreshToken) return Promise.reject(sessionChanged());
    const promise = (async () => {
      try {
        const tokens = tokenPair(
          await publicApi.request<Tokens>("/api/v1/auth/refresh", {
            method: "POST",
            body: { refresh_token: prior.refreshToken },
          }),
        );
        if (epoch !== expected) {
          // The server may have rotated while logout was clearing local state.
          // Revoke the returned credential without restoring the old session.
          await revoke(tokens).catch(() => undefined);
          throw sessionChanged();
        }
        try {
          await save(tokens, expected);
        } catch (error) {
          if (epoch !== expected) await revoke(tokens).catch(() => undefined);
          throw error;
        }
      } catch (error) {
        // A network failure may mean rotation succeeded remotely. Discard the
        // spent credential rather than ever attempting it again.
        await forget(
          expected,
          error instanceof ApiError && error.code === "account_suspended"
            ? "suspended"
            : "expired",
        );
        throw error;
      }
    })();
    refreshFlight = { epoch: expected, promise };
    void promise
      .finally(() => {
        if (refreshFlight?.promise === promise) refreshFlight = null;
      })
      .catch(() => undefined);
    return promise;
  };

  async function request<T>(
    path: string,
    requestOptions: ApiRequestOptions = {},
  ): Promise<T> {
    const expected = epoch;
    if (refreshFlight?.epoch === expected) await refreshFlight.promise;
    assertCurrent(expected);
    const attempted = credentials;
    if (!attempted) throw sessionChanged();
    try {
      const data = await authenticatedApi(attempted.accessToken).request<T>(
        path,
        requestOptions,
      );
      assertCurrent(expected);
      return data;
    } catch (error) {
      assertCurrent(expected);
      if (error instanceof ApiError && error.code === "account_suspended") {
        await forget(expected, "suspended");
        throw error;
      }
      if (!(error instanceof ApiError) || error.status !== 401) throw error;
      // Another request may already have rotated while this 401 was in flight.
      if (credentials?.accessToken === attempted.accessToken) await refresh();
      assertCurrent(expected);
      const method = (requestOptions.method ?? "GET").toUpperCase();
      if (method !== "GET" && method !== "HEAD") {
        throw new ApiError(
          401,
          "request_not_replayed",
          "Sign-in recovered. Submit the action again.",
          null,
          error.requestId,
          error.retryAfter,
        );
      }
      try {
        const data = await authenticatedApi(
          credentials!.accessToken,
        ).request<T>(path, requestOptions);
        assertCurrent(expected);
        return data;
      } catch (retryError) {
        if (retryError instanceof ApiError && retryError.status === 401)
          await forget(expected, "expired");
        if (
          retryError instanceof ApiError &&
          retryError.code === "account_suspended"
        )
          await forget(expected, "suspended");
        throw retryError;
      }
    }
  }

  async function reloadUser(): Promise<User> {
    const expected = epoch;
    const user = await request<User>("/api/v1/me");
    assertCurrent(expected);
    publish({ status: "authenticated", user, reason: null });
    return user;
  }

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    initialize() {
      if (initializeFlight) return initializeFlight;
      const expected = epoch;
      initializeFlight = (async () => {
        try {
          const existing = await options.tokenStore.get();
          assertCurrent(expected);
          const refreshToken =
            existing?.refreshToken ?? (await options.readRefreshToken?.());
          assertCurrent(expected);
          if (!refreshToken) {
            publish({ status: "signedOut", user: null, reason: null });
            return;
          }
          credentials = existing ?? { accessToken: "", refreshToken };
          // Native process restarts must exchange persisted refresh credentials
          // before performing any authenticated request.
          if (!credentials.accessToken) await refresh();
          await reloadUser();
        } catch (error) {
          await forget(
            expected,
            error instanceof ApiError && error.code === "account_suspended"
              ? "suspended"
              : "expired",
          );
        }
      })();
      return initializeFlight;
    },
    async login(data) {
      const expected = ++epoch;
      credentials = null;
      options.onClear?.();
      publish({ status: "loading", user: null, reason: null });
      try {
        await store(() => options.tokenStore.clear());
        assertCurrent(expected);
        const tokens = tokenPair(
          await publicApi.request<Tokens>("/api/v1/auth/login", {
            method: "POST",
            body: data,
          }),
        );
        if (epoch !== expected) {
          await revoke(tokens).catch(() => undefined);
          throw sessionChanged();
        }
        try {
          await save(tokens, expected);
        } catch (error) {
          if (epoch !== expected) await revoke(tokens).catch(() => undefined);
          throw error;
        }
        return await reloadUser();
      } catch (error) {
        await forget(
          expected,
          error instanceof ApiError && error.code === "account_suspended"
            ? "suspended"
            : null,
        );
        throw error;
      }
    },
    refresh,
    async logout() {
      const expected = epoch;
      const tokens = credentials;
      const results = await Promise.allSettled([
        forget(expected, null),
        tokens?.accessToken ? revoke(tokens) : Promise.resolve(),
      ]);
      // Local logout is complete even if the revocation request fails. Surface
      // that failure to the caller; never pretend remote revocation succeeded.
      for (const result of results) {
        if (result.status === "rejected") throw result.reason;
      }
    },
    request,
    reloadUser,
    updateUser(user) {
      if (
        snapshot.status === "authenticated" &&
        user.id === snapshot.user?.id
      ) {
        publish({ status: "authenticated", user, reason: null });
      }
    },
  };
}
