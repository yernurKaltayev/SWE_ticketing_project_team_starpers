import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, formatEventDateTime, formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { Field, Status } from "../auth/ui";
import { checkoutCoordinator } from "./attempt";
import { commerceCopy } from "./copy";
import { CommerceError } from "./ui";
import { paymentCopy } from "../payments/copy";
import {
  eventPath,
  parseAvailability,
  parseEvent,
  useCommerceQuery,
} from "./data";
import { makeOrderBody, parseVenue, registrationOpen } from "./model";
import type { Attendee, Availability, Event, OrderBody } from "./model";
import "./checkout.css";

export default function CheckoutPage({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  const { user } = useSession();
  const t = commerceCopy[locale];
  const event = useCommerceQuery(eventPath(eventId), parseEvent);
  const availability = useCommerceQuery(
    `/api/v1/events/${encodeURIComponent(eventId)}/availability`,
    parseAvailability,
  );
  const venue = useCommerceQuery(
    `/api/v1/venues/${encodeURIComponent(event.data?.venue_id ?? "")}`,
    parseVenue,
    !!event.data,
  );
  return (
    <section>
      <Link to="/events">{t.back}</Link>
      <h1>{paymentCopy[locale].checkout}</h1>
      <CommerceError
        error={event.error ?? availability.error}
        t={t}
        retry={() => {
          void event.refetch();
          void availability.refetch();
        }}
      />
      {(event.isPending || availability.isPending) && (
        <Status>{t.loading}</Status>
      )}
      {event.data && availability.data && user && (
        <div className="checkout-layout">
          <aside className="checkout-context" aria-label={t.event}>
            <h2>{event.data.title}</h2>
            <p>
              {formatEventDateTime(
                event.data.starts_at,
                event.data.timezone,
                locale,
              )}
            </p>
            {venue.data && (
              <p>
                {venue.data.name} · {venue.data.address} · {venue.data.city}
              </p>
            )}
            <CommerceError
              error={venue.error}
              t={t}
              retry={() => {
                void venue.refetch();
              }}
            />
            <p className="field-hint">{t.snapshot}</p>
            <p className="notice">{t.policy}</p>
          </aside>
          <CheckoutForm
            key={`${user.id}:${eventId}`}
            event={event.data}
            availability={availability.data}
            locale={locale}
            reload={() => {
              void event.refetch();
              void availability.refetch();
            }}
          />
        </div>
      )}
    </section>
  );
}

function CheckoutForm({
  event,
  availability,
  locale,
  reload,
}: {
  event: Event;
  availability: Availability;
  locale: Locale;
  reload: () => void;
}) {
  const { user, controller } = useSession();
  const t = commerceCopy[locale];
  const navigate = useNavigate();
  const coordinator = useMemo(
    () => checkoutCoordinator(controller),
    [controller],
  );
  const [initial] = useState(() => coordinator.draft(event.id));
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      initial?.items.map((i) => [i.ticket_type_id, i.quantity]) ?? [],
    ),
  );
  const [attendees, setAttendees] = useState<Attendee[]>(
    initial?.attendees ?? [],
  );
  const [review, setReview] = useState<OrderBody | null>(initial ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [, refreshRecovery] = useState(0);
  const active = useRef(true);
  const submitting = useRef(false);
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (review) reviewHeading.current?.focus();
  }, [review]);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const recovery = coordinator.recovery(event.id);
  const frozen = coordinator.draft(event.id);
  const choices = availability.choices;
  const paidActive = event.paid_sales_status === "active";
  const canChoose = (c: (typeof choices)[number]) =>
    c.free || (paidActive && !!c.price);
  const selectedPaid = choices.some(
    (c) => !c.free && (quantities[c.id] ?? 0) > 0,
  );
  const estimated = choices.reduce(
    (sum, c) => sum + (c.price ?? 0) * (quantities[c.id] ?? 0),
    0,
  );
  const p = paymentCopy[locale];
  const count = choices.reduce((sum, c) => sum + (quantities[c.id] ?? 0), 0);
  const labels = choices.flatMap((c) =>
    Array.from({ length: Math.min(100, quantities[c.id] ?? 0) }, () => c.name),
  );

  function quantity(id: string, value: number) {
    const next = { ...quantities, [id]: value };
    const total = choices.reduce((sum, c) => sum + (next[c.id] ?? 0), 0);
    setQuantities(next);
    setAttendees((old) =>
      Array.from(
        { length: Math.min(100, total) },
        (_, i) =>
          old[i] ?? {
            full_name: i === 0 ? (user?.full_name ?? "") : "",
            email: i === 0 ? (user?.email ?? "") : "",
          },
      ),
    );
  }
  async function confirm() {
    if (!review || submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setError(null);
    try {
      let body = frozen ?? review;
      if (!frozen) {
        const [latestEvent, raw] = await Promise.all([
          controller.request<Event>(eventPath(event.id)),
          controller.request(
            `/api/v1/events/${encodeURIComponent(event.id)}/availability`,
          ),
        ]);
        const latest = parseAvailability(raw);
        if (!registrationOpen(latestEvent, latest))
          throw new ApiError(
            409,
            "registration_closed",
            "Registration is closed.",
          );
        const selected = body.items.map((i) =>
          latest.choices.find((c) => c.id === i.ticket_type_id),
        );
        if (selected.some((c) => !c))
          throw new ApiError(
            409,
            "inventory_unavailable",
            "Availability changed.",
          );
        body = makeOrderBody(
          event.id,
          selected.filter((c) => c !== undefined),
          Object.fromEntries(
            body.items.map((i) => [i.ticket_type_id, i.quantity]),
          ),
          body.attendees,
          latestEvent.paid_sales_status === "active",
        );
      }
      const order = await coordinator.submit(body);
      if (active.current)
        navigate(`/account/orders/${encodeURIComponent(order.id)}`, {
          replace: true,
        });
    } catch (caught) {
      if (active.current) {
        setError(caught);
        refreshRecovery((n) => n + 1);
        reload();
      }
    } finally {
      submitting.current = false;
      if (active.current) setBusy(false);
    }
  }

  if (recovery?.orderId)
    return (
      <div>
        <Status>{t.existing}</Status>
        <p>
          <Link to={`/account/orders/${encodeURIComponent(recovery.orderId)}`}>
            {t.view}
          </Link>
        </p>
        <CommerceError error={error} t={t} />
        <button
          disabled={busy}
          className="secondary"
          onClick={() => {
            setBusy(true);
            setError(null);
            void coordinator
              .startAnother(event.id)
              .then(() => {
                if (active.current) {
                  setReview(null);
                  setQuantities({});
                  setAttendees([]);
                  refreshRecovery((n) => n + 1);
                }
              })
              .catch((e: unknown) => {
                if (active.current) setError(e);
              })
              .finally(() => {
                if (active.current) setBusy(false);
              });
          }}
        >
          {busy ? t.working : t.another}
        </button>
      </div>
    );

  if (recovery && !frozen)
    return (
      <div>
        <Status>{t.lost}</Status>
        <Link to="/account/orders">{t.orders}</Link>
      </div>
    );

  if (!recovery && !registrationOpen(event, availability))
    return (
      <Status>
        {event.seating_mode === "assigned" ? t.assigned : t.unavailable}
      </Status>
    );

  return (
    <div className="checkout-form">
      <CommerceError error={error} t={t} />
      {recovery && (
        <div className="notice" role="status">
          <p>{t.unknown}</p>
          <Link to="/account/orders">{t.orders}</Link>
        </div>
      )}
      {review ? (
        <section aria-labelledby="registration-review">
          <h2 id="registration-review" tabIndex={-1} ref={reviewHeading}>
            {t.review}
          </h2>
          <ul className="commerce-list">
            {review.items.map((item) => (
              <li key={item.ticket_type_id}>
                <strong>
                  {availability.choices.find(
                    (c) => c.id === item.ticket_type_id,
                  )?.name ?? t.ticket}
                </strong>
                <span>
                  {t.quantity}: {item.quantity} ·{" "}
                  {(() => {
                    const c = choices.find((c) => c.id === item.ticket_type_id);
                    return c?.free
                      ? t.free
                      : c?.price
                        ? formatMoney(c.price, locale)
                        : p.authoritative;
                  })()}
                </span>
              </li>
            ))}
          </ul>
          <h3>{t.details}</h3>
          <ol className="attendee-review">
            {review.attendees.map((a, i) => (
              <li key={i}>
                <strong>{a.full_name}</strong>
                <span>{a.email}</span>
              </li>
            ))}
          </ol>
          <p className="checkout-total">
            {selectedPaid ? p.estimate : t.total}:{" "}
            {formatMoney(estimated, locale)}
          </p>
          <p>{selectedPaid ? p.authoritative : t.freeHint}</p>
          <p>{t.reviewHint}</p>
          <div className="controls">
            <button
              disabled={busy}
              onClick={() => {
                void confirm();
              }}
            >
              {busy
                ? t.working
                : recovery
                  ? t.repeat
                  : selectedPaid
                    ? p.continue
                    : t.register}
            </button>
            {!recovery && (
              <button
                disabled={busy}
                className="secondary"
                onClick={() => {
                  setReview(null);
                  setError(null);
                }}
              >
                {t.edit}
              </button>
            )}
          </div>
        </section>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const invalid: Record<string, string> = {};
            attendees.forEach((a, i) => {
              if (!a.full_name.trim() || a.full_name.trim().length > 200)
                invalid[`attendee-name-${i}`] = t.nameRequired;
              if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email.trim()))
                invalid[`attendee-email-${i}`] = t.emailRequired;
            });
            setFields(invalid);
            try {
              if (Object.keys(invalid).length)
                throw new ApiError(
                  422,
                  "selection_invalid",
                  "Invalid attendee details.",
                );
              setReview(
                makeOrderBody(
                  event.id,
                  availability.choices,
                  quantities,
                  attendees,
                  paidActive,
                ),
              );
            } catch (caught) {
              setError(caught);
            }
          }}
          noValidate
        >
          <h2>{t.select}</h2>
          {!choices.some((c) => canChoose(c) && c.open && c.available > 0) && (
            <Status>{p.noTickets}</Status>
          )}
          <div className="ticket-choices">
            {choices.map((c) => (
              <div className="ticket-choice" key={c.id}>
                <div>
                  <strong>{c.name}</strong>
                  <p className="field-hint">
                    {c.free
                      ? t.free
                      : c.price
                        ? formatMoney(c.price, locale)
                        : p.authoritative}{" "}
                    · {t.limit}: {Math.min(c.available, c.limit)}
                  </p>
                </div>
                <Field
                  name={`quantity-${c.id}`}
                  label={`${t.quantity} · ${c.name}`}
                  type="number"
                  min={0}
                  max={Math.min(c.available, c.limit, 100)}
                  step={1}
                  disabled={!c.open || !c.available || !canChoose(c)}
                  value={quantities[c.id] ?? 0}
                  onChange={(e) =>
                    quantity(
                      c.id,
                      Math.max(
                        0,
                        Math.min(100, Math.floor(Number(e.target.value) || 0)),
                      ),
                    )
                  }
                />
              </div>
            ))}
          </div>
          {!paidActive && choices.some((c) => !c.free) && (
            <p className="notice">{p.blocked}</p>
          )}
          {count > 0 && (
            <>
              <h2>{t.details}</h2>
              <div className="attendee-fields">
                {attendees.map((a, i) => (
                  <fieldset className="attendee-fieldset" key={i}>
                    <legend>
                      {t.attendee} {i + 1} · {labels[i]}
                    </legend>
                    <Field
                      label={`${t.fullName} · ${i + 1}`}
                      name={`attendee-name-${i}`}
                      required
                      maxLength={200}
                      error={fields[`attendee-name-${i}`]}
                      value={a.full_name}
                      autoComplete="off"
                      onChange={(e) =>
                        setAttendees((old) =>
                          old.map((v, n) =>
                            n === i ? { ...v, full_name: e.target.value } : v,
                          ),
                        )
                      }
                    />
                    <Field
                      label={`${t.email} · ${i + 1}`}
                      name={`attendee-email-${i}`}
                      required
                      type="email"
                      maxLength={254}
                      error={fields[`attendee-email-${i}`]}
                      value={a.email}
                      autoComplete="off"
                      onChange={(e) =>
                        setAttendees((old) =>
                          old.map((v, n) =>
                            n === i ? { ...v, email: e.target.value } : v,
                          ),
                        )
                      }
                    />
                  </fieldset>
                ))}
              </div>
            </>
          )}
          <div className="controls">
            <button disabled={!count || count > 100}>{t.review}</button>
          </div>
        </form>
      )}
    </div>
  );
}
