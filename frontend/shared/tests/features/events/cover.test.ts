import { describe, expect, it } from "vitest";
import { coverProblem, coverRules } from "@biletflow/shared/features/events/cover";

describe("cover image rules", () => {
  it("accepts JPEG, PNG and WebP up to 5 MB", () => {
    expect(coverRules.maxBytes).toBe(5 * 1024 * 1024);
    for (const type of ["image/jpeg", "image/png", "image/webp"])
      expect(coverProblem({ type, size: coverRules.maxBytes })).toBeNull();
  });
  it("rejects other types, including iPhone HEIC and a missing type", () => {
    expect(coverProblem({ type: "image/heic", size: 1 })).toBe("type");
    expect(coverProblem({ type: null, size: 1 })).toBe("type");
  });
  it("rejects files over 5 MB", () => {
    expect(coverProblem({ type: "image/png", size: coverRules.maxBytes + 1 })).toBe("size");
  });
});
