/* Stages of the Halyk ePay test checkout, shown by the step tracker. They only reflect what the
 * page already knows (order loaded, token requested, form opened, API confirmation); they never
 * decide payment state. */

export const HALYK_STAGES = [
  "order",
  "token",
  "form",
  "confirm",
  "tickets",
] as const;
export type HalykStage = (typeof HALYK_STAGES)[number];
export type HalykStepState = "done" | "current" | "next" | "failed" | "upcoming";

/** State of each step when the flow is at `stage`. Reaching "tickets" without a failure is the
 * finished flow, so every step reads as done. `idle` marks the stage as waiting for the buyer
 * ("next") rather than running. */
export function halykStepStates(
  stage: HalykStage,
  { failed = false, idle = false }: { failed?: boolean; idle?: boolean } = {},
): Record<HalykStage, HalykStepState> {
  const at = HALYK_STAGES.indexOf(stage);
  const complete = stage === "tickets" && !failed;
  return Object.fromEntries(
    HALYK_STAGES.map((s, i) => {
      if (i < at || complete) return [s, "done"];
      if (i === at) return [s, failed ? "failed" : idle ? "next" : "current"];
      return [s, "upcoming"];
    }),
  ) as Record<HalykStage, HalykStepState>;
}
