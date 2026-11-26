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

  it("leaves everything else on the web", () => {
    for (const url of [
      "/account/tickets-archive",
      "/account/tickets/1/extra",
      "/events",
      "/",
      "https://other.example/account/tickets",
      "not a url at all",
    ])
      expect(nativeRouteFor(url, origin)).toBeNull();
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
  it("only lists paths the web app really has", () => {
    const app = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "web", "src", "App.tsx"),
      "utf8",
    );
    const webPaths = new Set(
      [...app.matchAll(/path(?:=|: )"([^"]+)"/g)].map((match) => match[1]),
    );
    for (const route of nativeRoutes) expect(webPaths).toContain(route.pattern);
  });
});
