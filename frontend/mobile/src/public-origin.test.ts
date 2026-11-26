import { describe, expect, it } from "vitest";
import { resolveWebOrigin } from "./public-origin";

describe("resolveWebOrigin", () => {
  it("prefers the web origin and falls back to the API origin", () => {
    expect(resolveWebOrigin("https://web.example", "https://api.example")).toBe("https://web.example");
    expect(resolveWebOrigin(undefined, "https://api.example/")).toBe("https://api.example");
    expect(resolveWebOrigin("", "https://api.example")).toBe("https://api.example");
  });
  it("returns null when nothing usable is configured", () => {
    expect(resolveWebOrigin(undefined, undefined)).toBeNull();
    expect(resolveWebOrigin("nonsense", undefined)).toBeNull();
  });
});
