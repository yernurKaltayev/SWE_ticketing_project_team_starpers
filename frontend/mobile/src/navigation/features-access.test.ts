import { describe, expect, it } from "vitest";
import { canOpenFeature } from "./features";

describe("canOpenFeature", () => {
  it("lets the server decide event Analytics and History, like the web", () => {
    for (const role of ["attendee", "organizer", "platform_admin"] as const) {
      expect(canOpenFeature("Analytics", role)).toBe(true);
      expect(canOpenFeature("History", role)).toBe(true);
    }
  });
  it("keeps the other organizer pages for organizers", () => {
    expect(canOpenFeature("EditEvent", "organizer")).toBe(true);
    expect(canOpenFeature("EditEvent", "attendee")).toBe(false);
    expect(canOpenFeature("Financials", "platform_admin")).toBe(false);
  });
  it("keeps admin pages for platform admins", () => {
    expect(canOpenFeature("Admin", "platform_admin")).toBe(true);
    expect(canOpenFeature("Admin", "organizer")).toBe(false);
    expect(canOpenFeature("AdminUnavailable", "attendee")).toBe(false);
  });
  it("opens everyday pages for everyone signed in", () => {
    expect(canOpenFeature("Orders", "attendee")).toBe(true);
  });
});
