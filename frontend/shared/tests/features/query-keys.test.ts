import { describe, expect, it } from "vitest";
import { afterRefundScopes, queryKeys } from "@biletflow/shared/features/query-keys";

// Each expected array is copied from the web call site that uses it today.
describe("queryKeys", () => {
  it("matches the web commerce keys (checkout/data.ts, checkout/Tickets.tsx, payments)", () => {
    expect(queryKeys.commerce("u", "/api/v1/me/orders")).toEqual(["f3", "u", "/api/v1/me/orders"]);
    expect(queryKeys.commerceAll()).toEqual(["f3"]);
    expect(queryKeys.ticketQr("u", "t", "valid")).toEqual(["f3-qr", "u", "t", "valid"]);
  });
  it("matches the web payments keys (payments/data.ts)", () => {
    expect(queryKeys.payments("u", "/p")).toEqual(["f4", "u", "/p"]);
    expect(queryKeys.paymentsAll()).toEqual(["f4"]);
  });
  it("matches the web operations keys (operations/data.ts)", () => {
    expect(queryKeys.operations("u", "/p")).toEqual(["f6", "u", "/p"]);
    expect(queryKeys.operationsOrders("u", "e")).toEqual(["f6", "u", "e", "orders"]);
  });
  it("matches the web support keys (support/data.ts, support/Thread.tsx)", () => {
    expect(queryKeys.support("u", "/p")).toEqual(["f9", "u", "/p"]);
    expect(queryKeys.supportHandler("u", "c", "open")).toEqual(["f9", "u", "handler", "c", "open"]);
  });
  it("matches the web admin and profile keys", () => {
    expect(queryKeys.admin("u", "settings")).toEqual(["f10", "u", "settings"]);
    expect(queryKeys.adminEventName("u", "e")).toEqual(["admin-event-name", "u", "e"]);
    expect(queryKeys.organizerProfile("u")).toEqual(["organizer-profile", "u"]);
  });
  it("passes a missing user through unchanged, like the web keys", () => {
    expect(queryKeys.commerce(undefined, "/p")).toEqual(["f3", undefined, "/p"]);
    expect(queryKeys.organizerProfile(null)).toEqual(["organizer-profile", null]);
  });
  it("lists the scopes a refund invalidates (operations/data.ts)", () => {
    expect(afterRefundScopes).toEqual(["f6", "f3", "f3-qr", "f4"]);
  });
});
