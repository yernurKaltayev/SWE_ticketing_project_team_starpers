/// <reference types="node" />
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { matchPath, nativeRouteFor, nativeRoutes } from "./routes";

const origin = "https://130-162-184-12.sslip.io";

describe("nativeRouteFor", () => {
  it("maps the tickets list", () => {
    expect(nativeRouteFor("/account/tickets", origin)).toEqual({ screen: "Tickets" });
    expect(nativeRouteFor(`${origin}/account/tickets/`, origin)).toEqual({ screen: "Tickets" });
  });

  it("maps one ticket, ignoring query and hash and decoding the id once", () => {
    expect(nativeRouteFor(`${origin}/account/tickets/abc%20d?x=1#y`, origin)).toEqual({
      screen: "TicketDetail",
      params: { ticketId: "abc d" },
    });
  });

  it("preserves the token and return path for email links", () => {
    expect(nativeRouteFor("/verify-email?token=abc%2Bdef", origin)).toEqual({
      screen: "VerifyEmail",
      params: { token: "abc+def", returnTo: undefined },
    });
    expect(nativeRouteFor("/reset-password?token=test&returnTo=%2Faccount", origin)).toEqual({
      screen: "ResetPassword",
      params: { token: "test", returnTo: "/account" },
    });
    expect(nativeRouteFor("/login?token=ignored", origin)?.screen).toBe("Login");
    expect(nativeRouteFor("/account", origin)).toEqual({ screen: "Account" });
  });

  it("opens both discovery URLs and retains their filters", () => {
    const home = nativeRouteFor("/?q=jazz&city=Almaty", origin);
    expect(home).toEqual(nativeRouteFor("/events?q=jazz&city=Almaty", origin));
    expect(home).toMatchObject({ screen: "Discover", params: { q: "jazz", city: "Almaty" } });
    expect(nativeRouteFor("/events/event-1", origin)).toEqual({ screen: "Event", params: { eventId: "event-1" } });
  });

  it("keeps unknown paths native and rejects external or malformed links", () => {
    expect(nativeRouteFor("/account/tickets-archive", origin)?.screen).toBe("NotFound");
    expect(nativeRouteFor("/organizer/unknown/history", origin)?.screen).toBe("OrganizerUnavailable");
    expect(nativeRouteFor("/admin/unknown/history", origin)?.screen).toBe("AdminUnavailable");
    expect(nativeRouteFor("/organizer/events/one/history", origin)?.screen).toBe("History");
    expect(nativeRouteFor("https://other.example/account/tickets", origin)).toBeNull();
    expect(nativeRouteFor("not a url at all", origin)).toBeNull();
  });

  it("keeps organizer, admin and promo checkout links pointed at the right records", () => {
    expect(nativeRouteFor("/organizer/events/e1/orders/o1", origin)).toEqual({
      screen: "OperationDetail", params: { eventId: "e1", orderId: "o1" },
    });
    expect(nativeRouteFor("/admin/orders?event_id=e1", origin)).toEqual({
      screen: "Admin", params: { section: "orders", event_id: "e1" },
    });
    expect(nativeRouteFor("/events/e1/checkout?promo=EXPO", origin)).toEqual({
      screen: "Checkout", params: { eventId: "e1", promo: "EXPO" },
    });
  });
});

describe("matchPath", () => {
  it("captures one segment per parameter", () => {
    expect(matchPath("/a/:id", "/a/1")).toEqual({ id: "1" });
    expect(matchPath("/a/:id", "/a/")).toBeNull();
    expect(matchPath("/a", "/a/1")).toBeNull();
  });
});

describe("nativeRoutes", () => {
  it("covers every web route exactly once, including dev routes and redirects", () => {
    const app = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "web", "src", "App.tsx"),
      "utf8",
    );
    const routeMarkup = app.match(/<Routes>([\s\S]*?)<\/Routes>/)?.[1] ?? "";
    const found = [...routeMarkup.matchAll(/"(\/[^"\s]*|\*)"/g)].map((match) => match[1]);
    const auth = app.match(/const authKinds: AuthKind\[\] = \[([\s\S]*?)\];/)?.[1] ?? "";
    const webPaths = new Set([...found, ...[...auth.matchAll(/"([^"]+)"/g)].map((match) => `/${match[1]}`)]);
    const native = nativeRoutes.map(({ pattern }) => pattern);
    expect(native.sort()).toEqual([...webPaths].sort());
  });
});
