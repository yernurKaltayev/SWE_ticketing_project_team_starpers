/**
 * Organizer hall builder: a layout is a list of sections, each with rows × seats per row.
 * Rows are numbered 1..N across the whole hall from the stage back, as the server builds them.
 */

export const maxLayoutSeats = 2000;
export const maxSections = 8;
export const maxRows = 30;
export const maxSeatsPerRow = 50;

export type PlanSection = {
  key: string;
  name: string;
  category: string;
  rows: number;
  seatsPerRow: number;
};

export type LayoutPlan = { name: string; sections: PlanSection[] };

export type PlanProblem = "name" | "section" | "clash" | "tooMany";

const whole = (n: number, max: number) => Number.isInteger(n) && n >= 1 && n <= max;

export const planSeats = (plan: LayoutPlan) =>
  plan.sections.reduce((sum, s) => sum + (whole(s.rows, maxRows) && whole(s.seatsPerRow, maxSeatsPerRow) ? s.rows * s.seatsPerRow : 0), 0);

/** The first thing to fix before the plan can be sent, or null. */
export function planProblem(plan: LayoutPlan): PlanProblem | null {
  if (!plan.name.trim()) return "name";
  if (
    !plan.sections.length ||
    plan.sections.length > maxSections ||
    plan.sections.some(
      (s) =>
        !s.name.trim() ||
        !s.category.trim() ||
        !whole(s.rows, maxRows) ||
        !whole(s.seatsPerRow, maxSeatsPerRow),
    )
  )
    return "section";
  const names = plan.sections.map((s) => s.name.trim().toLowerCase());
  if (new Set(names).size !== names.length) return "clash";
  if (planSeats(plan) > maxLayoutSeats) return "tooMany";
  return null;
}

/** Row numbers each section gets, in hall order (for the preview). */
export function planRowNumbers(plan: LayoutPlan): number[][] {
  let next = 0;
  return plan.sections.map((s) =>
    Array.from({ length: whole(s.rows, maxRows) ? s.rows : 0 }, () => ++next),
  );
}

/** The POST /venues/{id}/layouts body. */
export function planBody(plan: LayoutPlan) {
  return {
    name: plan.name.trim(),
    sections: plan.sections.map((s) => ({
      name: s.name.trim(),
      price_category: s.category.trim().toLowerCase(),
      rows: s.rows,
      seats_per_row: s.seatsPerRow,
    })),
  };
}
