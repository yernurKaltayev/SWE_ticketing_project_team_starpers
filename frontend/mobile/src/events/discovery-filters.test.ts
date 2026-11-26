import { describe, expect, it } from "vitest";
import { discoveryFilters, discoveryParams, featuredSlides } from "./discovery-filters";

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

describe("filter sheet", () => {
  it("applies the sheet without running search text that was never submitted", async () => {
    const { withSheetValues } = await import("./discovery-filters");
    const current = discoveryFilters({ q: "jazz" });
    expect(withSheetValues(current, { city: "Almaty" })).toMatchObject({ q: "jazz", city: "Almaty" });
  });
});

describe("featuredSlides", () => {
  it("puts events with a cover first and keeps at most five", () => {
    const e = (id: string, images: string[] = []) => ({ id, images });
    const slides = featuredSlides([e("a"), e("b", ["/b.webp"]), e("c"), e("d", ["/d.webp"]), e("e"), e("f"), e("g")]);
    expect(slides.map((s) => s.id)).toEqual(["b", "d", "a", "c", "e"]);
  });
});
