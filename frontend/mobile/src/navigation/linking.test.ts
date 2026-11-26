import { describe, expect, it } from "vitest";
import { getStateFromPath } from "@react-navigation/core";
import type { Screens } from "./params";
import { linkingConfig } from "./linking";
import { nativeRoutes } from "./routes";

describe("linkingConfig", () => {
  it("opens the same native screens as the route map", () => {
    expect(linkingConfig()).toMatchObject({
      // Tabs under every deep-linked screen, so back always leads into the app.
      initialRouteName: "Tabs",
      screens: {
        Tabs: { screens: {
          Discover: { path: "", alias: ["events"] },
          Tickets: { path: "account/tickets", alias: ["tickets"] },
          Account: "account",
        } },
        Login: "login",
        Register: "register",
        VerifyEmail: "verify-email",
        ForgotPassword: "forgot-password",
        ResetPassword: "reset-password",
        TicketDetail: "account/tickets/:ticketId",
      },
    });
  });

  it("opens email links with their decoded tokens and keeps discovery underneath", () => {
    const state = getStateFromPath<Screens>("/reset-password?token=a%2Bb&returnTo=%2Faccount", linkingConfig());
    expect(state?.routes).toMatchObject([
      { name: "Tabs" },
      { name: "ResetPassword", params: { token: "a+b", returnTo: "/account" } },
    ]);
  });

  it("parses both discovery paths on a cold start", () => {
    for (const path of ["/?q=jazz", "/events?q=jazz"]) {
      const state = getStateFromPath<Screens>(path, linkingConfig());
      expect(state?.routes).toMatchObject([
        { name: "Tabs", state: { routes: [{ name: "Discover", params: { q: "jazz" } }] } },
      ]);
    }
  });

  it("opens the intended screen for every route, including legacy links and wildcards", () => {
    const config = linkingConfig();
    for (const route of nativeRoutes) {
      const path = "/" + route.pattern.replace(/^\//, "").replace(/:[^/]+/g, "sample").replace(/\*/g, "unmatched/tail");
      const params = Object.fromEntries([...route.pattern.matchAll(/:([^/]+)/g)].map(([, key]) => [key, "sample"]));
      const state = getStateFromPath<Screens>(path, config);
      const current = state?.routes.at(-1);
      const screen = current?.state?.routes.at(-1)?.name ?? current?.name;
      expect(screen, path).toBe(route.to(params, new URLSearchParams()).screen);
    }
  });
});
