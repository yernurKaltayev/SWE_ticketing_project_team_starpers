import { describe, expect, it } from "vitest";
import { defaultCity, nearestCity } from "./venues";

describe("nearestCity", () => {
  const cities = ["Almaty", "Astana", "Шымкент", "Somewhere"];
  it("picks the closest listed city, aliases included", () => {
    expect(nearestCity(cities, 51.13, 71.43)).toBe("Astana");
    expect(nearestCity(cities, 42.3, 69.6)).toBe("Шымкент");
    expect(nearestCity(cities, 43.25, 76.9)).toBe("Almaty");
  });
  it("skips cities without coordinates", () => {
    expect(nearestCity(["Somewhere"], 43, 76)).toBeUndefined();
  });
  it("falls back to Almaty, else the first city", () => {
    expect(defaultCity(["Astana", "almaty"])).toBe("almaty");
    expect(defaultCity(["Astana"])).toBe("Astana");
  });
});
