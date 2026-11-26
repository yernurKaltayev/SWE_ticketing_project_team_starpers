import { describe, expect, it } from "vitest";
import { mimeFor, safeFileName } from "./file-names";

describe("safeFileName", () => {
  it("keeps letters, digits, - and _ like the web ticket PDF name", () => {
    expect(safeFileName("TKT-1/2 ü", "pdf")).toBe("TKT-1_2__.pdf");
  });
  it("caps the base at 100 characters", () => {
    expect(safeFileName("a".repeat(200), "csv")).toBe(`${"a".repeat(100)}.csv`);
  });
  it("never produces an empty name", () => {
    expect(safeFileName("", "csv")).toBe("biletflow.csv");
  });
});

describe("mimeFor", () => {
  it("maps each supported extension", () => {
    expect(mimeFor("pdf")).toBe("application/pdf");
    expect(mimeFor("csv")).toBe("text/csv");
    expect(mimeFor("ics")).toBe("text/calendar");
    expect(mimeFor("png")).toBe("image/png");
  });
});
