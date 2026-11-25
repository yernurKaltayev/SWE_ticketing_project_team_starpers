import { describe, expect, it } from "vitest";
import { blobToDataUri, isAdmissible, ticketPaths, ticketTone } from "./model";

describe("ticketPaths", () => {
  it("builds the own-tickets page path", () => {
    expect(ticketPaths.mine()).toBe("/api/v1/me/tickets?limit=50&offset=0");
    expect(ticketPaths.mine(50, 25)).toBe("/api/v1/me/tickets?limit=25&offset=50");
  });
  it("encodes ids", () => {
    expect(ticketPaths.qr("a/b")).toBe("/api/v1/tickets/a%2Fb/qr");
    expect(ticketPaths.ticket("a/b")).toBe("/api/v1/tickets/a%2Fb");
    expect(ticketPaths.event("e 1")).toBe("/api/v1/events/e%201");
  });
});

describe("ticketTone", () => {
  it("maps each server status", () => {
    expect(ticketTone("valid")).toBe("success");
    expect(ticketTone("checked_in")).toBe("warning");
    expect(ticketTone("refunded")).toBe("danger");
    expect(ticketTone("cancelled")).toBe("danger");
    expect(ticketTone("something_new")).toBe("neutral");
  });
});

describe("isAdmissible", () => {
  it("is true only for valid tickets", () => {
    expect(isAdmissible("valid")).toBe(true);
    expect(isAdmissible("checked_in")).toBe(false);
    expect(isAdmissible("refunded")).toBe(false);
  });
});

describe("blobToDataUri", () => {
  it("returns a data URI with the blob's type", async () => {
    const uri = await blobToDataUri(new Blob(["hi"], { type: "image/png" }));
    expect(uri).toBe("data:image/png;base64,aGk=");
  });
});
