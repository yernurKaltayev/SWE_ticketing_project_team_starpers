import { describe, expect, it, vi } from "vitest";
import { ApiError, createApiClient } from "../src/api-client";

function mockFetch(response: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(response);
}

describe("API transport", () => {
  it("calls the root health endpoint once with bearer authentication and no cookie assumption", async () => {
    const transport = mockFetch(Response.json({ status: "ok" }));
    const client = createApiClient({
      baseUrl: "http://localhost:8000",
      fetch: transport,
      getAccessToken: async () => "access",
    });
    await expect(client.request("/health")).resolves.toEqual({ status: "ok" });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe("http://localhost:8000/health");
    expect(new Headers(options?.headers).get("Authorization")).toBe(
      "Bearer access",
    );
    expect(options?.credentials).toBe("omit");
    expect(options?.redirect).toBe("error");
  });

  it("preserves structured server errors, validation fields and request ID without retrying writes", async () => {
    const details = [
      { field: "body.email", type: "value_error", message: "Invalid email" },
    ];
    const transport = mockFetch(
      Response.json(
        {
          code: "validation_error",
          message: "The request is invalid.",
          details,
        },
        {
          status: 422,
          headers: { "X-Request-ID": "request-123" },
        },
      ),
    );
    const client = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: transport,
    });
    const error = await client
      .request("/api/v1/auth/register", {
        method: "POST",
        body: { email: "invalid" },
      })
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 422,
      code: "validation_error",
      details,
      requestId: "request-123",
    });
    expect(transport).toHaveBeenCalledTimes(1);
    const options = transport.mock.calls[0]![1];
    expect(options?.body).toBe('{"email":"invalid"}');
    expect(new Headers(options?.headers).get("Content-Type")).toBe(
      "application/json",
    );
  });

  it("supports 204 without trying to decode an empty JSON body", async () => {
    const transport = mockFetch(new Response(null, { status: 204 }));
    const client = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: transport,
    });
    await expect(
      client.request<void>("/api/v1/auth/logout", { method: "POST" }),
    ).resolves.toBeUndefined();
  });

  it("normalizes a non-JSON HTTP error and rejects invalid successful JSON", async () => {
    const badGateway = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: mockFetch(
        new Response("<html>Gateway failure</html>", { status: 502 }),
      ),
    });
    await expect(badGateway.request("/health")).rejects.toMatchObject({
      status: 502,
      code: "http_502",
      details: null,
    });
    const invalid = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: mockFetch(
        new Response("not json", {
          status: 200,
          headers: { "X-Request-ID": "bad-json" },
        }),
      ),
    });
    await expect(invalid.request("/health")).rejects.toMatchObject({
      status: 200,
      code: "invalid_response",
      requestId: "bad-json",
    });
  });

  it("normalizes a network failure without retrying", async () => {
    const transport = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new TypeError("Failed to fetch"));
    const client = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: transport,
    });
    await expect(client.request("/health")).rejects.toMatchObject({
      status: 0,
      code: "network_error",
      requestId: null,
    });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it("passes cancellation through without displaying it as a network error", async () => {
    const controller = new AbortController();
    const abort = new DOMException("The request was aborted.", "AbortError");
    const transport = vi.fn<typeof fetch>().mockRejectedValue(abort);
    const client = createApiClient({
      baseUrl: "https://api.example.test",
      fetch: transport,
    });
    await expect(
      client.request("/health", { signal: controller.signal }),
    ).rejects.toBe(abort);
    expect(transport.mock.calls[0]![1]?.signal).toBe(controller.signal);
  });

  it.each([
    "https://evil.example.test/api/v1/me",
    "//evil.example.test/api/v1/me",
    "/health",
    "../outside",
    "/api/v11/me",
    "/api/v1/%2foutside",
  ])(
    "refuses a request that can escape the configured origin/path: %s",
    async (path) => {
      const transport = mockFetch(Response.json({}));
      const tokenProvider = vi.fn(() => "secret");
      const client = createApiClient({
        baseUrl: "https://api.example.test/api/v1",
        fetch: transport,
        getAccessToken: tokenProvider,
      });
      await expect(client.request(path)).rejects.toBeInstanceOf(TypeError);
      expect(tokenProvider).not.toHaveBeenCalled();
      expect(transport).not.toHaveBeenCalled();
    },
  );

  it("resolves relative paths inside a configured API prefix and can omit authentication", async () => {
    const transport = mockFetch(Response.json({ id: "user" }));
    const client = createApiClient({
      baseUrl: "https://api.example.test/api/v1",
      fetch: transport,
      getAccessToken: () => null,
    });
    await client.request("me", {
      headers: { "X-Request-ID": "client-request" },
    });
    const [url, options] = transport.mock.calls[0]!;
    expect(url).toBe("https://api.example.test/api/v1/me");
    const headers = new Headers(options?.headers);
    expect(headers.has("Authorization")).toBe(false);
    expect(headers.has("Content-Type")).toBe(false);
    expect(headers.get("X-Request-ID")).toBe("client-request");
  });
});
