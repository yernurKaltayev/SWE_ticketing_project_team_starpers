import { describe, expect, it } from "vitest";
import { linkingConfig } from "./linking";
import { nativeRoutes } from "./routes";

describe("linkingConfig", () => {
  it("opens the same native screens as the route map", () => {
    expect(linkingConfig()).toEqual({
      screens: {
        Tabs: { screens: { Tickets: "account/tickets" } },
        TicketDetail: "account/tickets/:ticketId",
      },
    });
  });

  it("covers every route-map pattern", () => {
    const config = JSON.stringify(linkingConfig());
    for (const route of nativeRoutes) expect(config).toContain(`"${route.pattern.slice(1)}"`);
  });
});
