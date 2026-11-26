import { describe, expect, it } from "vitest";
import { discoveryFilters, discoveryParams } from "./discovery-filters";

describe("discovery filters", () => {
  it("reads only supported URL filters and trims search text", () => {
    const params = new URLSearchParams("q=+jazz+&city=Almaty&ignored=1");
    expect(discoveryFilters(discoveryParams(params))).toEqual({
      q: "jazz",
      category: "",
      city: "Almaty",
      date_from: "",
      date_to: "",
    });
  });

  it("keeps valid calendar dates and discards impossible days", () => {
    expect(discoveryFilters({ date_from: "2028-02-29", date_to: "2026-02-29" })).toMatchObject({
      date_from: "2028-02-29",
      date_to: "",
    });
  });
});
