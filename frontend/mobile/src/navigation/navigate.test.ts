import { describe, expect, it } from "vitest";
import { navigationFor } from "./navigate";

describe("navigationFor", () => {
  it("opens the Tickets tab", () => {
    expect(navigationFor({ screen: "Tickets" }, true)).toEqual({
      name: "Tabs",
      params: { screen: "Tickets" },
    });
  });
  it("opens one ticket for a signed-in user", () => {
    expect(navigationFor({ screen: "TicketDetail", params: { ticketId: "t" } }, true)).toEqual({
      name: "TicketDetail",
      params: { ticketId: "t", eventTitle: null },
    });
  });
  it("sends a signed-out user to the Tickets tab, where the sign-in panel is", () => {
    expect(navigationFor({ screen: "TicketDetail", params: { ticketId: "t" } }, false)).toEqual({
      name: "Tabs",
      params: { screen: "Tickets" },
    });
  });
});
