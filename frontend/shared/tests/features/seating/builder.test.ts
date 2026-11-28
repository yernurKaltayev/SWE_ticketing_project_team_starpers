import { describe, expect, it } from "vitest";
import {
  planBody,
  planProblem,
  planRowNumbers,
  planSeats,
} from "../../../src/features/seating/builder";
import type { LayoutPlan } from "../../../src/features/seating/builder";

const plan = (over: Partial<LayoutPlan> = {}): LayoutPlan => ({
  name: " Main hall ",
  sections: [
    { key: "a", name: "Parterre", category: " Standard ", rows: 3, seatsPerRow: 4 },
    { key: "b", name: "Balcony", category: "vip", rows: 2, seatsPerRow: 2 },
  ],
  ...over,
});

describe("hall builder", () => {
  it("counts seats and numbers rows across the hall", () => {
    expect(planSeats(plan())).toBe(16);
    expect(planRowNumbers(plan())).toEqual([[1, 2, 3], [4, 5]]);
  });

  it("finds the first problem", () => {
    expect(planProblem(plan())).toBeNull();
    expect(planProblem(plan({ name: " " }))).toBe("name");
    expect(planProblem(plan({ sections: [] }))).toBe("section");
    const [a, b] = plan().sections;
    expect(planProblem(plan({ sections: [a!, { ...b!, rows: 0 }] }))).toBe("section");
    expect(planProblem(plan({ sections: [a!, { ...b!, seatsPerRow: 2.5 }] }))).toBe("section");
    expect(planProblem(plan({ sections: [a!, { ...b!, name: " parterre" }] }))).toBe("clash");
    const big = { key: "x", name: "X", category: "x", rows: 30, seatsPerRow: 50 };
    expect(planProblem(plan({ sections: [big, { ...big, key: "y", name: "Y" }] }))).toBe("tooMany");
  });

  it("builds the request body", () => {
    expect(planBody(plan())).toEqual({
      name: "Main hall",
      sections: [
        { name: "Parterre", price_category: "standard", rows: 3, seats_per_row: 4 },
        { name: "Balcony", price_category: "vip", rows: 2, seats_per_row: 2 },
      ],
    });
  });
});
