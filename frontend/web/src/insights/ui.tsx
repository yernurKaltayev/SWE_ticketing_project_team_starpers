import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ApiError, formatMoney, formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field } from "../auth/ui";
import { label } from "./copy";
import { moneyFields } from "./model";
import type { Row } from "./model";
import "./insights.css";
export function Failure({
  error,
  locale
}: {
  error: unknown;
  locale: Locale;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  return <div role="alert" tabIndex={-1} ref={ref} className="form-error">
  <p>
    {label(locale, error instanceof ApiError && [401, 403, 404].includes(error.status) ? "denied" : "error")}
  </p>
  {error instanceof ApiError && error.requestId && <p>
    {error.requestId}
  </p>}
</div>;
}
export function EventLinks({
  id,
  locale
}: {
  id: string;
  locale: Locale;
}) {
  const root = `/organizer/events/${encodeURIComponent(id)}`;
  return <nav className="controls insights-links" aria-label={label(locale, "events")}>
  {[["edit", `${root}/edit`], ["analytics", `${root}/analytics`], ["history", `${root}/history`], ["orders", `${root}/orders`], ["attendees", `${root}/orders?view=attendees`], ["refunds", `${root}/orders?view=refunds`], ["campaigns", `${root}/promotions`], ["support", `/support?role=handler&event_id=${encodeURIComponent(id)}`], ["checkin", `${root}/analytics#attendance`]].map(([name, path]) => <Link key={name} to={path!}>
    {label(locale, name!)}
  </Link>)}
</nav>;
}
export function DateFields({
  locale,
  params,
  keys = ["date_from", "date_to"],
  zone
}: {
  locale: Locale;
  params: URLSearchParams;
  keys?: [string, string];
  zone: string;
}) {
  return <>
  <Field label={`${label(locale, "from")} · ${zone}`} name={keys[0]} type="datetime-local" defaultValue={params.get(keys[0]) ?? ""} />
  <Field label={`${label(locale, "to")} · ${zone}`} name={keys[1]} type="datetime-local" defaultValue={params.get(keys[1]) ?? ""} />
</>;
}
export function Pager({
  offset,
  total,
  onChange,
  locale
}: {
  offset: number;
  total: number;
  onChange: (n: number) => void;
  locale: Locale;
}) {
  return <nav className="controls" aria-label={`${label(locale, "previous")} / ${label(locale, "next")}`}>
  <button type="button" className="secondary" disabled={!offset} onClick={() => onChange(Math.max(0, offset - 20))}>
    {label(locale, "previous")}
  </button>
  <span>
    {total ? offset + 1 : 0}
    –
    {Math.min(total, offset + 20)}
     /
    {total}
  </span>
  <button type="button" className="secondary" disabled={offset + 20 >= total} onClick={() => onChange(offset + 20)}>
    {label(locale, "next")}
  </button>
</nav>;
}
export function Value({
  field,
  value,
  locale,
  zone = "UTC"
}: {
  field: string;
  value: unknown;
  locale: Locale;
  zone?: string;
}) {
  if (value === null || value === undefined) return <>
  {label(locale, "none")}
</>;
  if (moneyFields.has(field) && typeof value === "number") return <>
  {formatMoney(value, locale)}
</>;
  if (typeof value === "boolean") return <>
  {label(locale, value ? "yes" : "no")}
</>;
  if (field.endsWith("_at") && typeof value === "string") return <>
  {formatEventDateTime(value, zone, locale)}
</>;
  if (["status", "role", "audience", "kind", "category", "paid_sales_status"].includes(field)) return <>
  {label(locale, String(value))}
</>;
  return <>
  {String(value)}
</>;
}
export function RecordDetails({
  row,
  fields,
  locale
}: {
  row: Row;
  fields: string[];
  locale: Locale;
}) {
  return <dl className="record-details">
  {fields.map(key => <div key={key}>
    <dt>
      {label(locale, key)}
    </dt>
    <dd>
      <Value field={key} value={row[key]} locale={locale} />
    </dd>
  </div>)}
</dl>;
}
export function Confirm({
  title,
  children,
  locale,
  busy,
  blocked = false,
  reason,
  reasonValue,
  onReason,
  onClose,
  onConfirm,
  error
}: {
  title: string;
  children: ReactNode;
  locale: Locale;
  busy: boolean;
  blocked?: boolean;
  reason?: boolean;
  reasonValue?: string;
  onReason?: (s: string) => void;
  onClose: () => void;
  onConfirm: () => void;
  error?: unknown;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const node = ref.current;
    node?.showModal();
    cancel.current?.focus();
    return () => {
      node?.close();
      previous?.focus();
    };
  }, []);
  return <dialog ref={ref} className="insights-dialog" aria-labelledby="f10-confirm-title" onCancel={e => {
    e.preventDefault();
    if (!busy) onClose();
  }}>
  <h2 id="f10-confirm-title">{title}</h2>
  {children}
  <Failure error={error} locale={locale} />
  {blocked && <p role="alert">
    {label(locale, "unknown")}
  </p>}
  {reason && <Field name="f10-reason" label={label(locale, "reason")} hint={label(locale, "reasonHint")} value={reasonValue ?? ""} maxLength={500} disabled={busy} onChange={e => onReason?.(e.target.value)} />}
  <div className="controls">
    <button type="button" className="secondary" ref={cancel} disabled={busy} onClick={onClose}>
      {label(locale, "keep")}
    </button>
    <button type="button" disabled={busy || blocked || !!reason && (!reasonValue?.trim() || reasonValue.trim().length > 500)} onClick={onConfirm}>
      {label(locale, busy ? "working" : "confirm")}
    </button>
  </div>
</dialog>;
}
