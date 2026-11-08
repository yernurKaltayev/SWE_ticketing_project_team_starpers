import { useEffect, useRef } from "react";
import { ApiError } from "@biletflow/shared";
import type { CommerceCopy } from "./copy";
export function CommerceError({
  error,
  t,
  retry,
}: {
  error: unknown;
  t: CommerceCopy;
  retry?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  let message = t.error;
  if (error instanceof ApiError) {
    if (error.status === 0) message = t.network;
    if (error.status === 403 || error.status === 404) message = t.denied;
    if (error.status === 409) message = t.conflict;
    if (error.status === 422 || error.code === "selection_invalid")
      message = t.selection;
    if (error.code === "outcome_unknown" || error.code === "key_reused")
      message = t.lost;
    if (error.code === "storage_unavailable") message = t.storage;
    if (error.code === "request_not_replayed") message = t.notReplayed;
    if (error.code === "session_changed") message = t.session;
  }
  return (
    <div className="form-error" role="alert" tabIndex={-1} ref={ref}>
      <p>{message}</p>
      {error instanceof ApiError && error.requestId && (
        <p className="field-hint">
          {t.requestId}: {error.requestId}
        </p>
      )}
      {retry && (
        <button type="button" className="secondary" onClick={retry}>
          {t.retry}
        </button>
      )}
    </div>
  );
}
export function CommerceStatus({
  value,
  t,
}: {
  value: string;
  t: CommerceCopy;
}) {
  return (
    <span className="status-badge">{t.states[value] ?? t.unknownStatus}</span>
  );
}
