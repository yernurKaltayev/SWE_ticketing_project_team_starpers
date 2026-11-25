import { Link } from "react-router-dom";
import { ApiError, formatDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { supportCopy } from "./copy";
import type { SupportCopy } from "./copy";
import type { Context } from "./model";
import { supportLink } from "./model";
export function SupportLink({
  locale,
  context = {},
}: {
  locale: Locale;
  context?: Context;
}) {
  return (
    <Link className="action-link ghost" to={supportLink(context)}>
      {supportCopy[locale].contact}
    </Link>
  );
}
export function SupportError({ error, t }: { error: unknown; t: SupportCopy }) {
  if (!error) return null;
  return (
    <div role="alert" className="form-error">
      <p>
        {error instanceof ApiError && [401, 403, 404].includes(error.status)
          ? t.denied
          : error instanceof ApiError &&
              error.code === "support_context_mismatch"
            ? t.contextMismatch
            : error instanceof ApiError && error.code === "invalid_assignee"
              ? t.invalidAssignee
              : t.error}
      </p>
      {error instanceof ApiError && error.status >= 500 && error.requestId && <p>{error.requestId}</p>}
    </div>
  );
}
export function ContextDetails({
  context,
  t,
}: {
  context: Context;
  t: SupportCopy;
}) {
  if (!context.event_id && !context.order_id && !context.ticket_id) return null;
  return (
    <div className="support-context">
      <h2>{t.context}</h2>
      <dl>
        {(["event_id", "order_id", "ticket_id"] as const)
          .filter((k) => context[k])
          .map((k) => (
            <div key={k}>
              <dt>
                {
                  t[
                    k === "event_id"
                      ? "event"
                      : k === "order_id"
                        ? "order"
                        : "ticket"
                  ]
                }
              </dt>
              <dd>{context[k]}</dd>
            </div>
          ))}
      </dl>
    </div>
  );
}
export function Timestamp({
  value,
  locale,
}: {
  value: string;
  locale: Locale;
}) {
  return (
    <time dateTime={value}>
      {formatDateTime(value, locale, { time: true })}
    </time>
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
  t: SupportCopy;
}) {
  if (offset === 0 && total <= 20) return null;
  return (
    <nav className="controls" aria-label={`${t.previous} / ${t.next}`}>
      <button
        className="secondary"
        disabled={!offset}
        onClick={() => change(Math.max(0, offset - 20))}
      >
        {t.previous}
      </button>
      <span>
        {total ? offset + 1 : 0}–{Math.min(offset + 20, total)} / {total}
      </span>
      <button
        className="secondary"
        disabled={offset + 20 >= total}
        onClick={() => change(offset + 20)}
      >
        {t.next}
      </button>
    </nav>
  );
}
