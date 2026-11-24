import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { ApiError, formatEventDateTime, intlLocales } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import type { Event } from "./model";
import { InputError } from "./model";
import type { EventCopy } from "./copy";
import { eventCopy } from "./copy";

export function EventError({
  error,
  t,
  retry,
}: {
  error: unknown;
  t: EventCopy;
  retry?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  const codes: Record<string, string> = {
    event_requires_ticket_type: t.needsTickets,
    capacity_below_ticket_quantity: t.capacityError,
    email_not_verified: t.verified,
    invalid_event_status: t.statusError,
    event_has_orders: t.hasOrders,
    event_cancellation_requires_refund_flow: t.hasOrders,
    invalid_sales_window: t.salesWindowError,
    capacity_exceeded: t.ticketCapacityError,
    quantity_below_allocated: t.quantityAllocated,
    price_locked: t.priceLocked,
    invalid_quantity: t.quantityError,
    invalid_ticket_update: t.ticketInvalid,
    sales_closed: t.salesClosed,
    event_cancelled: t.eventCancelled,
    event_seating_locked: t.seatingLocked,
  };
  // Only a request that never reached the server is a connection problem. A server error says
  // so, and any other rejection shows the server's own reason rather than blaming the network.
  const apiMessage = (e: ApiError) =>
    codes[e.code] ??
    ([403, 404].includes(e.status)
      ? t.denied
      : e.code === "network_error"
        ? t.error
        : e.status >= 500
          ? t.serverError
          : e.message || t.error);
  const fields =
    error instanceof ApiError && Array.isArray(error.details)
      ? error.details
          .map((v: unknown) =>
            v &&
            typeof v === "object" &&
            "field" in v &&
            typeof v.field === "string"
              ? v.field.replace(/^body\./, "")
              : undefined,
          )
          .filter((v): v is string => !!v && v in t)
      : [];
  if (error instanceof InputError) fields.push(error.field);
  return (
    <div className="form-error" tabIndex={-1} ref={ref} role="alert">
      <p>
        {error instanceof InputError
          ? t.invalid
          : error instanceof ApiError
            ? apiMessage(error)
            : t.error}
      </p>
      {fields.length > 0 && (
        <ul>
          {fields.map((field) => (
            <li key={field}>
              <a href={`#${field}`}>
                {t[field as keyof EventCopy]}: {t.invalid}
              </a>
            </li>
          ))}
        </ul>
      )}
      {error instanceof ApiError && error.requestId && (
        <p>ID: {error.requestId}</p>
      )}
      {retry && (
        <button type="button" onClick={retry}>
          {t.retry}
        </button>
      )}
    </div>
  );
}
export function SelectField({
  name,
  label,
  children,
  defaultValue = "",
  required = false,
}: {
  name: string;
  label: string;
  children: ReactNode;
  defaultValue?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <select
        id={name}
        name={name}
        defaultValue={defaultValue}
        required={required}
      >
        {children}
      </select>
    </div>
  );
}
export function TextArea({
  name,
  label,
  value = "",
  required = false,
}: {
  name: string;
  label: string;
  value?: string;
  required?: boolean;
}) {
  return (
    <div className="field">
      <label htmlFor={name}>{label}</label>
      <textarea
        id={name}
        name={name}
        defaultValue={value}
        required={required}
        rows={4}
      />
    </div>
  );
}
export function Image({ src, title }: { src: string; title: string }) {
  const [hidden, setHidden] = useImageVisibility(src);
  if (hidden || !/^https?:\/\//i.test(src)) return null;
  return (
    <img
      className="event-image"
      src={src}
      alt={title}
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setHidden()}
    />
  );
}
function useImageVisibility(src: string) {
  const [failed, setFailed] = useState<string | null>(null);
  return [failed === src, () => setFailed(src)] as const;
}

const kazakhMonths = [
  "Қаң",
  "Ақп",
  "Нау",
  "Сәу",
  "Мам",
  "Мау",
  "Шіл",
  "Там",
  "Қыр",
  "Қаз",
  "Қар",
  "Жел",
];

/** Generated cover for events without imagery: the event's own date, large. */
export function CoverArt({ event, locale }: { event: Event; locale: Locale }) {
  const date = new Date(event.starts_at);
  const valid = !Number.isNaN(date.getTime());
  const part = (options: Intl.DateTimeFormatOptions) => {
    try {
      return new Intl.DateTimeFormat(intlLocales[locale], {
        timeZone: event.timezone,
        ...options,
      });
    } catch {
      return new Intl.DateTimeFormat(intlLocales[locale], options);
    }
  };
  let month = valid ? part({ month: "short" }).format(date) : "";
  // Some engines ship no Kazakh month names and print "M01".
  if (/^M\d+$/.test(month)) {
    const index = Number(part({ month: "numeric" }).format(date)) - 1;
    month = kazakhMonths[index] ?? month;
  }
  const time = valid
    ? part({ hour: "2-digit", minute: "2-digit", hour12: false }).format(date)
    : "";
  return (
    <div className="cover-art" aria-hidden="true">
      {valid && (
        <span className="cover-date">
          <strong>{part({ day: "numeric" }).format(date)}</strong>
          <span>
            {month.replace(".", "")} · {time}
          </span>
        </span>
      )}
      <svg viewBox="0 0 120 80" fill="none">
        <path
          d="M6 14a6 6 0 0 1 6-6h96a6 6 0 0 1 6 6v12a12 12 0 0 0 0 28v12a6 6 0 0 1-6 6H12a6 6 0 0 1-6-6V54a12 12 0 0 0 0-28Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

/** The organizer's refund terms as buyers see them; nothing when none are set. */
export function RefundPolicy({
  event,
  locale,
}: {
  event: Event;
  locale: Locale;
}) {
  const policy = event.refund_policy;
  if (!policy?.summary?.trim()) return null;
  const t = eventCopy[locale];
  return (
    <div className="panel">
      <h2>{t.refund}</h2>
      <p>{policy.summary}</p>
      {policy.refundable_until && (
        <p className="field-hint">
          {t.refundable_until}:{" "}
          {formatEventDateTime(policy.refundable_until, event.timezone, locale)}
        </p>
      )}
    </div>
  );
}
