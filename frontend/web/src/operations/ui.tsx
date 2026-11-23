import { useEffect, useRef } from "react";
import { ApiError } from "@biletflow/shared";
import type { OperationsCopy } from "./copy";
import { toneFor } from "../tone";
export function OperationError({
  error,
  t,
  retry,
}: {
  error: unknown;
  t: OperationsCopy;
  retry?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  let message = t.error;
  if (error instanceof ApiError) {
    if ([401, 403, 404].includes(error.status)) message = t.denied;
    if (error.code === "refund_failed") message = t.failedResult;
    if (error.code === "already_checked_in") message = t.noAction;
    if (error.code === "snapshot_changed") message = t.changed;
    if (error.code === "storage_unavailable") message = t.storage;
    if (error.code === "outcome_unknown") message = t.unknown;
  }
  return (
    <div role="alert" tabIndex={-1} ref={ref} className="form-error">
      <p>{message}</p>
      {error instanceof ApiError && error.requestId && <p>{error.requestId}</p>}
      {retry && <button onClick={retry}>{t.refresh}</button>}
    </div>
  );
}
export function State({ value, t }: { value: string; t: OperationsCopy }) {
  return (
    <span className="status-badge" data-tone={toneFor(value)}>
      {t.state[value as keyof typeof t.state] ?? t.state.unknown}
    </span>
  );
}
export function Pager({
  offset,
  total,
  change,
  t,
}: {
  offset: number;
  total: number;
  change: (n: number) => void;
  t: OperationsCopy;
}) {
  if (offset === 0 && total <= 20) return null;
  return (
    <nav className="controls" aria-label={`${t.previous} / ${t.next}`}>
      <span>
        {Math.min(total, offset + 1)}–{Math.min(total, offset + 20)} / {total}
      </span>
      <button
        disabled={!offset}
        onClick={() => change(Math.max(0, offset - 20))}
      >
        {t.previous}
      </button>
      <button
        disabled={offset + 20 >= total}
        onClick={() => change(offset + 20)}
      >
        {t.next}
      </button>
    </nav>
  );
}
