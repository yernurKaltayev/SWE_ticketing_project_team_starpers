import { Link } from "react-router-dom";
import { ApiError, intlLocales } from "@biletflow/shared";
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
  return <Link to={supportLink(context)}>{supportCopy[locale].title}</Link>;
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
      {error instanceof ApiError && error.requestId && <p>{error.requestId}</p>}
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
  return (
    <div className="support-context">
      <h2>{t.context}</h2>
      <p>{t.contextHint}</p>
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
      {new Intl.DateTimeFormat(intlLocales[locale], {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))}
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
