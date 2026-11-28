import { PromoEntry } from "../promotions/PromoEntry";
import { usePromotion } from "../promotions/usePromotion";
import { validatePromo, selectedCart } from "../promotions/model";
import { promoCopy, reasonText } from "../promotions/copy";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ReceiptIcon } from "../icons";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError, formatEventDateTime, formatPrice } from "@biletflow/shared";
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
import { withSeats } from "@biletflow/shared/features/seating/booking";
import type { SeatCart } from "@biletflow/shared/features/seating/booking";
import { clearSeatCart, loadSeatCart } from "../seating/cart";
import { seatingCopy } from "../seating/copy";
import { BackLink } from "../BackLink";
import { eventCopy } from "../events/copy";
import { paidSalesOpen } from "../events/model";

export default function CheckoutPage({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  const { user } = useSession();
  const t = commerceCopy[locale];
  const [cartSlot, setCartSlot] = useState<HTMLDivElement | null>(null);
  // Numbered seats arrive already held from the hall plan (/events/:id/seats).
  const [seats] = useState(() => loadSeatCart(eventId));
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
      <BackLink to={`/events/${eventId}`}>{eventCopy[locale].backToEvent}</BackLink>
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
      {event.data?.seating_mode === "assigned" && !seats && availability.data && (
        <div className="checkout-form checkout-state" role="status">
          <h2>{seatingCopy[locale].pickTitle}</h2>
          <p>{seatingCopy[locale].pickFirst}</p>
          <div className="checkout-state-actions">
            <Link className="action-link" to={`/events/${encodeURIComponent(eventId)}/seats`}>
              {seatingCopy[locale].chooseSeats}
            </Link>
          </div>
        </div>
      )}
      {event.data && availability.data && user &&
        (event.data.seating_mode !== "assigned" || seats) && (
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
                {venue.data.name} · {venue.data.address}
              </p>
            )}
            <CommerceError
              error={venue.error}
              t={t}
              retry={() => {
                void venue.refetch();
              }}
            />
            {event.data.refund_policy?.summary && (
              <p className="notice">{event.data.refund_policy.summary}</p>
            )}
            <div ref={setCartSlot} />
          </aside>
          <CheckoutForm
            seats={event.data.seating_mode === "assigned" ? seats : null}
            cartSlot={cartSlot}
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
  cartSlot,
  seats,
}: {
  seats: SeatCart | null;
  cartSlot: HTMLElement | null;
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
  // With a single ticket type on sale, start at one ticket instead of zero so
  // the main action is ready; several types still start empty.
  const [single] = useState(() => {
    const open = availability.choices.filter(
      (c) =>
        c.open &&
        c.available > 0 &&
        (c.free || (paidSalesOpen(event) && !!c.price)),
    );
    return !initial && !seats && open.length === 1 ? open[0].id : null;
  });
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    seats
      ? Object.fromEntries(seats.items.map((i) => [i.ticket_type_id, i.quantity]))
      : single
      ? { [single]: 1 }
      : Object.fromEntries(
          initial?.items.map((i) => [i.ticket_type_id, i.quantity]) ?? [],
        ),
  );
  const [attendees, setAttendees] = useState<Attendee[]>(
    () =>
      initial?.attendees ??
      (seats
        ? seats.seats.map((_, i) => ({
            full_name: i === 0 ? (user?.full_name ?? "") : "",
            email: i === 0 ? (user?.email ?? "") : "",
          }))
        : single
        ? [{ full_name: user?.full_name ?? "", email: user?.email ?? "" }]
        : []),
  );
  const [review, setReview] = useState<OrderBody | null>(initial ?? null);
  const [reviewDiscount, setReviewDiscount] = useState<number | null>(null);
  const [reviewSubtotal, setReviewSubtotal] = useState<number | null>(null);
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
  const promotion = usePromotion(
    event.id,
    choices,
    quantities,
    controller.request,
  );
  const pt = promoCopy[locale];
  const paidActive = paidSalesOpen(event);
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
  const st = seatingCopy[locale];
  const seatName = (s: SeatCart["seats"][number]) => `${st.row} ${s.row}, ${st.seat} ${s.label}`;
  // With numbered seats each attendee is named per seat, in the order the items list them.
  const labels = seats
    ? seats.items.flatMap((i) =>
        i.seat_ids.map((id) => {
          const seat = seats.seats.find((s) => s.id === id);
          return seat ? seatName(seat) : (choices.find((c) => c.id === i.ticket_type_id)?.name ?? "");
        }),
      )
    : choices.flatMap((c) =>
        Array.from({ length: Math.min(100, quantities[c.id] ?? 0) }, () => c.name),
      );
  const holdLeft = useHoldCountdown(seats?.expiresAt);
  // Our own hold already counts as reserved, so availability is short by exactly those seats.
  const withHeld = (list: typeof choices) =>
    seats
      ? list.map((c) => ({
          ...c,
          available:
            c.available + (seats.items.find((i) => i.ticket_type_id === c.id)?.quantity ?? 0),
        }))
      : list;

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
        if (!registrationOpen(latestEvent, latest, Date.now(), !!seats))
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
        const promoCode = body.promo_code;
        body = makeOrderBody(
          event.id,
          withHeld(selected.filter((c) => c !== undefined)),
          Object.fromEntries(
            body.items.map((i) => [i.ticket_type_id, i.quantity]),
          ),
          body.attendees,
          paidSalesOpen(latestEvent),
        );
        if (seats) body = withSeats(body, seats);
        if (promoCode) {
          const ids = body.items.flatMap((i) =>
            Array<string>(i.quantity).fill(i.ticket_type_id),
          );
          const quote = await validatePromo(
            controller.request,
            event.id,
            promoCode,
            ids,
          );
          if (!quote.valid)
            throw new ApiError(
              422,
              quote.reason ?? "promo_not_found",
              "Promotion rejected.",
            );
          const currentCart = selectedCart(
            latest.choices,
            Object.fromEntries(
              body.items.map((i) => [i.ticket_type_id, i.quantity]),
            ),
          );
          if (
            !currentCart ||
            currentCart.subtotal !== reviewSubtotal ||
            quote.discount_amount !== reviewDiscount
          ) {
            setReview(null);
            throw new ApiError(
              409,
              "promo_changed",
              "Review the updated promotion.",
            );
          }
          body = { ...body, promo_code: promoCode };
        }
      }
      const order = await coordinator.submit(body);
      if (seats) clearSeatCart(event.id);
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
      <div className="checkout-form checkout-state" role="status">
        <span className="checkout-state-icon" aria-hidden="true">
          <ReceiptIcon size={22} />
        </span>
        <h2>{t.existingTitle}</h2>
        <p>{t.existingHint}</p>
        {error instanceof ApiError &&
        (error.code.startsWith("promo_") || error.code === "promo_changed") ? (
          <p role="alert">
            {error.code === "promo_changed"
              ? pt.changed
              : reasonText(error.code, pt)}
          </p>
        ) : (
          <CommerceError error={error} t={t} />
        )}
        <div className="checkout-state-actions">
        <Link className="action-link" to={`/account/orders/${encodeURIComponent(recovery.orderId)}`}>
          {t.view}
        </Link>
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
      </div>
    );

  if (recovery && !frozen)
    return (
      <div className="checkout-form checkout-state" role="status">
        <span className="checkout-state-icon" aria-hidden="true">
          <ReceiptIcon size={22} />
        </span>
        <h2>{t.lostTitle}</h2>
        <p>{t.lost}</p>
        <div className="checkout-state-actions">
          <Link className="action-link" to="/account/orders">{t.orders}</Link>
        </div>
      </div>
    );

  if (!recovery && !registrationOpen(event, availability, undefined, !!seats))
    return (
      <Status>
        {event.seating_mode === "assigned" ? t.assigned : t.unavailable}
      </Status>
    );

  // Order summary in the side card: what is picked so far and what it costs.
  const picked = choices.filter((c) => (quantities[c.id] ?? 0) > 0);
  const cart = (
    <div className="checkout-cart">
      {picked.length === 0 ? (
        <p className="checkout-cart-empty">{t.noTickets}</p>
      ) : (
        <ul>
          {picked.map((c) => (
            <li key={c.id}>
              <span>
                {c.name} × {quantities[c.id]}
              </span>
              <span>
                {c.free || !c.price
                  ? t.free
                  : formatPrice(c.price * (quantities[c.id] ?? 0), locale)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {picked.length > 0 && (
        <p className="checkout-cart-total">
          <span>{t.total}</span>
          <strong>{estimated === 0 ? t.free : formatPrice(estimated, locale)}</strong>
        </p>
      )}
    </div>
  );

  return (
    <div className="checkout-form">
      {cartSlot && createPortal(cart, cartSlot)}
      {error instanceof ApiError &&
      (error.code.startsWith("promo_") || error.code === "promo_changed") ? (
        <p role="alert">
          {error.code === "promo_changed"
            ? pt.changed
            : reasonText(error.code, pt)}
        </p>
      ) : (
        <CommerceError error={error} t={t} />
      )}
      {recovery && (
        <div className="notice" role="status">
          <p>{t.unknown}</p>
          <Link className="action-link ghost" to="/account/orders">{t.orders}</Link>
        </div>
      )}
      {review ? (
        <section aria-labelledby="registration-review">
          <h2 id="registration-review" tabIndex={-1} ref={reviewHeading}>
            {t.reviewTitle}
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
                  {item.quantity} ×{" "}
                  {(() => {
                    const c = choices.find((c) => c.id === item.ticket_type_id);
                    return c?.free
                      ? t.free
                      : c?.price
                        ? formatPrice(c.price, locale)
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
                {seats && labels[i] && <span>{labels[i]}</span>}
                <span>{a.email}</span>
              </li>
            ))}
          </ol>
          {review.promo_code && (
            <>
              <p>
                {pt.applied}: <strong>{review.promo_code}</strong>
              </p>
              {reviewDiscount !== null && (
                <>
                  <p>
                    {pt.preview}: {formatPrice(reviewDiscount, locale)}
                  </p>
                  <p>
                    {pt.due}:{" "}
                    {formatPrice(
                      Math.max(
                        0,
                        (reviewSubtotal ?? estimated) - reviewDiscount,
                      ),
                      locale,
                    )}
                  </p>
                </>
              )}
              <p>{pt.previewHint}</p>
            </>
          )}
          <p className="checkout-total" hidden={!!review.promo_code}>
            <span>{t.total}</span>
            <strong>{estimated === 0 ? t.free : formatPrice(estimated, locale)}</strong>
          </p>
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
              if (promotion.blocked)
                throw new ApiError(
                  422,
                  "promo_not_applicable",
                  "Validate or remove the promotion.",
                );
              setReviewSubtotal(estimated);
              setReviewDiscount(
                promotion.result?.valid
                  ? promotion.result.discount_amount
                  : null,
              );
              let orderBody = makeOrderBody(
                event.id,
                withHeld(availability.choices),
                quantities,
                attendees,
                paidActive,
              );
              if (seats) orderBody = withSeats(orderBody, seats);
              setReview({ ...orderBody, promo_code: promotion.code || null });
            } catch (caught) {
              setError(caught);
            }
          }}
          noValidate
        >
          {seats ? (
            <SeatHoldBlock seats={seats} seatName={seatName} left={holdLeft} eventId={event.id} locale={locale} />
          ) : (<>
          <h2>{t.select}</h2>
          {!choices.some((c) => canChoose(c) && c.open && c.available > 0) && (
            <Status>{p.noTickets}</Status>
          )}
          <div className="ticket-choices">
            {choices.map((c) => {
              const max = Math.min(c.available, c.limit, 100);
              const choosable = c.open && c.available > 0 && canChoose(c);
              const value = quantities[c.id] ?? 0;
              return (
                <div className="ticket-choice" key={c.id}>
                  <div>
                    <strong>{c.name}</strong>
                    <p className="field-hint">
                      {c.free
                        ? t.free
                        : c.price
                          ? formatPrice(c.price, locale)
                          : p.authoritative}
                      {choosable && max > 1 ? ` · ${t.limit} ${max}` : ""}
                    </p>
                  </div>
                  {choosable ? (
                    <div className="qty-stepper">
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`− ${c.name}`}
                        disabled={value <= 0}
                        onClick={() => quantity(c.id, value - 1)}
                      >
                        −
                      </button>
                      <Field
                        name={`quantity-${c.id}`}
                        label={`${t.quantity} · ${c.name}`}
                        type="number"
                        min={0}
                        max={max}
                        step={1}
                        value={value}
                        onChange={(e) =>
                          quantity(
                            c.id,
                            Math.max(
                              0,
                              Math.min(max, Math.floor(Number(e.target.value) || 0)),
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="secondary"
                        aria-label={`+ ${c.name}`}
                        disabled={value >= max}
                        onClick={() => quantity(c.id, value + 1)}
                      >
                        +
                      </button>
                    </div>
                  ) : (
                    <span className="status-badge" data-tone="neutral">
                      {canChoose(c) && c.open ? eventCopy[locale].soldOut : eventCopy[locale].paidBlocked}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          </>)}
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
                      label={t.fullName}
                      aria-label={`${t.fullName} · ${i + 1}`}
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
                      label={t.email}
                      aria-label={`${t.email} · ${i + 1}`}
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
          <PromoEntry
            key={promotion.code}
            promotion={promotion}
            locale={locale}
            disabled={busy || !!recovery}
          />
          <div className="controls">
            <button disabled={!count || count > 100 || promotion.blocked || (!!seats && holdLeft === 0)}>
              {t.review}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

/** Seconds left on the seat hold, ticking each second; null when there is no hold. */
function useHoldCountdown(expiresAt: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1000)) : null;
}

function SeatHoldBlock({
  seats,
  seatName,
  left,
  eventId,
  locale,
}: {
  seats: SeatCart;
  seatName: (s: SeatCart["seats"][number]) => string;
  left: number | null;
  eventId: string;
  locale: Locale;
}) {
  const st = seatingCopy[locale];
  const seatsLink = `/events/${encodeURIComponent(eventId)}/seats`;
  const clock = left === null ? "" : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <section className="seat-hold" aria-labelledby="seat-hold-title">
      <div className="seat-hold-head">
        <h2 id="seat-hold-title">{st.yourSeats}</h2>
        <Link className="action-link ghost" to={seatsLink}>{st.changeSeats}</Link>
      </div>
      <ul className="seat-hold-list">
        {seats.seats.map((s) => (
          <li key={s.id}>
            <strong>{seatName(s)}</strong>
            <span>{s.section}</span>
          </li>
        ))}
      </ul>
      {left === 0 ? (
        <p className="form-error" role="alert">{st.holdExpired}</p>
      ) : (
        <p className="seat-hold-timer" role="timer" aria-live="off">
          {st.heldFor} <strong>{clock}</strong>
          <span>{st.heldHint}</span>
        </p>
      )}
    </section>
  );
}
