import { useId, useState } from "react";
import type { Locale } from "@biletflow/shared";
import { paymentCopy } from "./copy";
import { HALYK_STAGES, halykStepStates } from "./halykStages";
import type { HalykStage, HalykStepState } from "./halykStages";

/** Step tracker for the Halyk ePay test checkout. Each step is a disclosure explaining what
 * happens there; the active step's explanation opens by itself. */

type Copy = (typeof paymentCopy)["en"];

const stepText = (t: Copy): Record<HalykStage, [string, string]> => ({
  order: [t.halykStepOrder, t.halykStepOrderDetail],
  token: [t.halykStepToken, t.halykStepTokenDetail],
  form: [t.halykStepForm, t.halykStepFormDetail],
  confirm: [t.halykStepConfirm, t.halykStepConfirmDetail],
  tickets: [t.halykStepTickets, t.halykStepTicketsDetail],
});

const stateText = (t: Copy): Record<HalykStepState, string> => ({
  done: t.halykStateDone,
  current: t.halykStateCurrent,
  next: t.halykStateNext,
  failed: t.halykStateFailed,
  upcoming: t.halykStateUpcoming,
});

export function HalykSteps({
  stage,
  failed = false,
  idle = false,
  locale,
}: {
  stage: HalykStage;
  failed?: boolean;
  idle?: boolean;
  locale: Locale;
}) {
  const t = paymentCopy[locale];
  const base = useId();
  const states = halykStepStates(stage, { failed, idle });
  const text = stepText(t);
  const labels = stateText(t);
  // The buyer's choice holds until the flow moves on; then the new active step opens.
  const [choice, setChoice] = useState<{
    stage: HalykStage;
    open: HalykStage | null;
  }>({ stage, open: stage });
  const open = choice.stage === stage ? choice.open : stage;

  return (
    <nav className="halyk-steps" aria-label={t.halykProgress}>
      <ol>
        {HALYK_STAGES.map((s, i) => {
          const state = states[s];
          const [title, detail] = text[s];
          const expanded = open === s;
          const panel = `${base}-${s}`;
          return (
            <li
              key={s}
              data-state={state}
              aria-current={
                state === "current" || state === "next" || state === "failed"
                  ? "step"
                  : undefined
              }
            >
              <span className="halyk-step-marker" aria-hidden="true">
                {state === "done" ? "✓" : state === "failed" ? "!" : i + 1}
              </span>
              <button
                type="button"
                className="halyk-step-toggle"
                aria-expanded={expanded}
                aria-controls={panel}
                onClick={() => setChoice({ stage, open: expanded ? null : s })}
              >
                <span className="halyk-step-title">{title}</span>
                <span className="halyk-step-state">{labels[state]}</span>
              </button>
              <p id={panel} className="halyk-step-detail" hidden={!expanded}>
                {detail}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
