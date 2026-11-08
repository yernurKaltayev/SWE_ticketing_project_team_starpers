import { expect, it, vi } from "vitest";
import { createApiClient } from "../src/api-client";
import { createSession } from "../src/session";
import { createMemoryTokenStore } from "../src/token-store";

it("downloads binary data with bearer auth and refuses external download URLs", async () => {
  const transport = vi.fn(
    async () =>
      new Response("%PDF-1.4", {
        headers: { "Content-Type": "application/pdf" },
      }),
  );
  const api = createApiClient({
    baseUrl: "https://api.example.com",
    fetch: transport,
    getAccessToken: () => "private-access",
  });
  const blob = await api.request<Blob>("/api/v1/tickets/one/pdf", {
    responseType: "blob",
  });
  expect(await blob.text()).toBe("%PDF-1.4");
  expect(
    new Headers(
      (transport.mock.calls[0] as unknown as [string, RequestInit])[1].headers,
    ).get("Authorization"),
  ).toBe("Bearer private-access");
  await expect(
    api.request("https://other.example.com/pdf", { responseType: "blob" }),
  ).rejects.toBeInstanceOf(TypeError);
  expect(transport).toHaveBeenCalledTimes(1);
});

it("keeps canonical JSON errors and request IDs on binary download failures", async () => {
  const api = createApiClient({
    baseUrl: "https://api.example.com",
    fetch: vi.fn(async () =>
      Response.json(
        { code: "forbidden", message: "Denied", details: null },
        {
          status: 403,
          headers: { "X-Request-ID": "download-denied" },
        },
      ),
    ),
  });
  await expect(
    api.request("/pdf", { responseType: "blob" }),
  ).rejects.toMatchObject({
    status: 403,
    code: "forbidden",
    requestId: "download-denied",
  });
});

it("uses the existing single-flight rotating session for concurrent binary 401s", async () => {
  const user = {
    id: "user",
    email: "test@example.com",
    full_name: "Test",
    phone: null,
    role: "attendee",
    email_verified_at: "2026-01-01T00:00:00Z",
  };
  let expired = false;
  let refreshes = 0;
  const transport = vi.fn(
    async (input: string | URL | Request, options?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      if (path.endsWith("/login"))
        return Response.json({ access_token: "old", refresh_token: "refresh" });
      if (path.endsWith("/refresh")) {
        refreshes++;
        return Response.json({
          access_token: "new",
          refresh_token: "replacement",
        });
      }
      if (path.endsWith("/logout")) return new Response(null, { status: 204 });
      if (
        expired &&
        new Headers(options?.headers).get("Authorization") === "Bearer old"
      )
        return Response.json(
          { code: "unauthorized", message: "Expired" },
          { status: 401 },
        );
      if (path.endsWith("/me")) return Response.json(user);
      return new Response("canonical-png", {
        headers: { "Content-Type": "image/png" },
      });
    },
  );
  const session = createSession({
    baseUrl: "https://api.example.com",
    tokenStore: createMemoryTokenStore(),
    fetch: transport,
  });
  await session.login({ email: user.email, password: "fixture-only" });
  expired = true;
  const results = await Promise.all([
    session.request<Blob>("/one/qr", { responseType: "blob" }),
    session.request<Blob>("/two/qr", { responseType: "blob" }),
  ]);
  expect(refreshes).toBe(1);
  expect(await results[0]!.text()).toBe("canonical-png");
  expect(results[1]!.type).toBe("image/png");
  await session.logout();
});
