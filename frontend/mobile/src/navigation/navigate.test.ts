import { describe, expect, it } from "vitest";
import { navigationFor } from "./navigate";

describe("navigationFor", () => {
  it("opens the Tickets tab", () => {
    expect(navigationFor({ screen: "Tickets" })).toEqual({
      name: "Tabs",
      params: { screen: "Tickets" },
    });
  });
  it("keeps the ticket destination so sign-in can render in place", () => {
    expect(navigationFor({ screen: "TicketDetail", params: { ticketId: "t" } })).toEqual({
      name: "TicketDetail",
      params: { ticketId: "t", eventTitle: null },
    });
  });
  it("opens account in its tab", () => {
    expect(navigationFor({ screen: "Account" })).toEqual({
      name: "Tabs",
      params: { screen: "Account" },
    });
  });
});
