export class ApiError extends Error {
  readonly name = "ApiError";
  readonly status: number;
  readonly code: string;
  readonly details: unknown;
  readonly requestId: string | null;
  readonly retryAfter: string | null;

  constructor(
    status: number,
    code: string,
    message: string,
    details: unknown = null,
    requestId: string | null = null,
    retryAfter: string | null = null,
  ) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.requestId = requestId;
    this.retryAfter = retryAfter;
  }
}

export interface ApiRequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
  headers?: HeadersInit;
}

export interface ApiClientOptions {
  /** Absolute API origin, or an origin with a fixed path prefix. */
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  getAccessToken?: () => string | null | Promise<string | null>;
}

export interface ApiClient {
  request<T>(path: string, options?: ApiRequestOptions): Promise<T>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isAbort(error: unknown): boolean {
  return isRecord(error) && error.name === "AbortError";
}

/**
 * JSON-only transport. It performs one request, without retries or implicit refresh.
 * Pass an origin base URL to request both /health and /api/v1/... paths.
 * With a path-prefixed base, relative paths resolve inside that prefix; a rooted
 * path must explicitly include it. Cross-origin and path-escaping URLs are refused.
 */
export function createApiClient(options: ApiClientOptions): ApiClient {
  const base = new URL(options.baseUrl);
  if (
    !["http:", "https:"].includes(base.protocol) ||
    base.username ||
    base.password
  ) {
    throw new TypeError(
      "The API base URL must be an HTTP(S) URL without credentials.",
    );
  }
  if (base.search || base.hash) {
    throw new TypeError(
      "The API base URL must not include a query or fragment.",
    );
  }
  const prefix = base.pathname.replace(/\/+$/, "");
  base.pathname = `${prefix}/`;
  const requestFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  return {
    async request<T>(
      path: string,
      requestOptions: ApiRequestOptions = {},
    ): Promise<T> {
      const url = new URL(path, base);
      // Encoded separators can be decoded by a server after our prefix check.
      const hasEncodedSeparator = /%2f|%5c/i.test(url.pathname);
      const insidePrefix =
        !prefix ||
        url.pathname === prefix ||
        url.pathname.startsWith(`${prefix}/`);
      if (
        url.origin !== base.origin ||
        !insidePrefix ||
        hasEncodedSeparator ||
        url.username ||
        url.password ||
        url.hash
      ) {
        throw new TypeError(
          "The request URL must remain within the configured API base.",
        );
      }

      const headers = new Headers(requestOptions.headers);
      if (!headers.has("Accept")) headers.set("Accept", "application/json");
      const token = await options.getAccessToken?.();
      if (token) headers.set("Authorization", `Bearer ${token}`);

      const body =
        requestOptions.body === undefined
          ? undefined
          : JSON.stringify(requestOptions.body);
      if (body !== undefined && !headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
      }

      let response: Response;
      let raw: string;
      try {
        response = await requestFetch(url.toString(), {
          method: requestOptions.method ?? "GET",
          headers,
          ...(body === undefined ? {} : { body }),
          ...(requestOptions.signal ? { signal: requestOptions.signal } : {}),
          // F0 follows the current bearer contract; cookie refresh is not implemented.
          credentials: "omit",
          redirect: "error",
        });
        raw = response.status === 204 ? "" : await response.text();
      } catch (error) {
        if (requestOptions.signal?.aborted || isAbort(error)) throw error;
        throw new ApiError(0, "network_error", "The API could not be reached.");
      }

      const requestId = response.headers.get("X-Request-ID");
      let data: unknown;
      if (raw.trim()) {
        try {
          data = JSON.parse(raw);
        } catch {
          if (response.ok) {
            throw new ApiError(
              response.status,
              "invalid_response",
              "The API returned invalid JSON.",
              null,
              requestId,
            );
          }
        }
      }

      if (!response.ok) {
        const error = isRecord(data) ? data : {};
        throw new ApiError(
          response.status,
          typeof error.code === "string"
            ? error.code
            : `http_${response.status}`,
          typeof error.message === "string"
            ? error.message
            : `The request failed (${response.status}).`,
          error.details ?? null,
          requestId,
          response.headers.get("Retry-After"),
        );
      }
      return data as T;
    },
  };
}
