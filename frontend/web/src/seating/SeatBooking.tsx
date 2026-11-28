import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError, formatEventDateTime, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import {
  canAddSeat,
  choicePrice,
  hallCategories,
  hallSections,
  maxSeats,
  offerForSeat,
  seatGroups,
} from "@biletflow/shared/features/seating/booking";
import type { SeatCart } from "@biletflow/shared/features/seating/booking";
import { useSession } from "../auth/session";
import { parseAvailability } from "../checkout/model";
import { parseEvent } from "../events/contracts";
import { useEventRequest, useResource } from "../events/data";
import { categoryLabelOf } from "./categories";
import { clearSeatCart, loadSeatCart, saveSeatCart } from "./cart";
import { seatingCopy } from "./copy";
import { categoryMatches, parseHold } from "./model";
import type { Seat } from "./model";
import { useSeatMap } from "./useSeatMap";
import "./seating.css";

/**
 * The buyer's hall plan: tap free seats, see the price of each, hold them and go to checkout.
 * Each seat is sold as the ticket type of its price category; the server holds them for a few
 * minutes, and checkout turns the holds into an order.
 */
export function SeatBooking({ eventId, locale }: { eventId: string; locale: Locale }) {
  const t = seatingCopy[locale];
  const { user } = useSession();
  const navigate = useNavigate();
  const request = useEventRequest();
  const path = `/api/v1/events/${encodeURIComponent(eventId)}`;
  const event = useResource(path, parseEvent);
  const offers = useResource(`${path}/availability`, parseAvailability);
  const map = useSeatMap(eventId, request);
  const seats = useMemo(() => (map.data?.event_id === eventId ? map.data.seats : []), [map.data, eventId]);
  const sections = useMemo(() => hallSections(seats), [seats]);
  const categories = useMemo(() => hallCategories(seats), [seats]);
  const choices = useMemo(() => offers.data?.choices ?? [], [offers.data]);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<"justTaken" | "holdFailed" | null>(null);
  const [limitHit, setLimitHit] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const reloadMap = map.reload;
  const reloadOffers = offers.reload;

  // Coming back from checkout: give the held seats back, then offer the same ones again.
  useEffect(() => {
    const cart = loadSeatCart(eventId);
    if (!cart || !user) return;
    clearSeatCart(eventId);
    void Promise.allSettled(
      cart.holdIds.map((id) =>
        request(`${path}/holds/${encodeURIComponent(id)}`, { method: "DELETE" }),
      ),
    ).then(() => {
      setPicked(cart.seats.map((s) => s.id));
      reloadMap();
    });
  }, [eventId, user, request, path, reloadMap]);

  // Others keep buying: refresh the plan while the page is open.
  useEffect(() => {
    const refresh = () => {
      if (!document.hidden) reloadMap();
    };
    const poll = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", refresh);
    };
  }, [reloadMap]);

  useEffect(() => {
    if (error) errorRef.current?.focus();
  }, [error]);

  const chosen = picked
    .map((id) => seats.find((s) => s.id === id))
    .filter((s): s is Seat => !!s && s.status === "available");
  const total = chosen.reduce((sum, s) => {
    const offer = offerForSeat(s, choices);
    return sum + (offer ? choicePrice(offer) : 0);
  }, 0);
  const tone = (category: string | null) =>
    Math.max(0, categories.findIndex((c) => categoryMatches(c, category))) % 4;
  const priceOf = (category: string | null) => {
    const offer = offerForSeat({ price_category: category }, choices);
    if (!offer) return null;
    const price = choicePrice(offer);
    return price === 0 ? t.free : formatPrice(price, locale);
  };

  function toggle(seat: Seat) {
    setError(null);
    if (picked.includes(seat.id)) {
      setPicked((old) => old.filter((id) => id !== seat.id));
      setLimitHit(false);
      return;
    }
    if (!canAddSeat(seat, chosen, choices)) {
      setLimitHit(true);
      return;
    }
    setLimitHit(false);
    setPicked((old) => [...old, seat.id]);
  }

  async function book() {
    if (busy || !chosen.length) return;
    if (!user) {
      navigate(`/login?returnTo=${encodeURIComponent(`/events/${eventId}/seats`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    const made: string[] = [];
    try {
      const groups = seatGroups(chosen, choices);
      const holds = [];
      for (const group of groups) {
        const hold = parseHold(
          await request(`${path}/holds`, {
            method: "POST",
            body: { ticket_type_id: group.choice.id, seat_ids: group.seats.map((s) => s.id) },
          }),
        );
        made.push(hold.id);
        holds.push({ hold, group });
      }
      const cart: SeatCart = {
        eventId,
        holdIds: made,
        expiresAt: holds
          .map((h) => h.hold.expires_at)
          .sort((a, b) => Date.parse(a) - Date.parse(b))[0]!,
        items: holds.map(({ hold, group }) => ({
          ticket_type_id: group.choice.id,
          quantity: hold.seat_ids.length,
          // The order the buyer picked them in, so attendee 1 is the first seat chosen.
          seat_ids: group.seats.map((s) => s.id).filter((id) => hold.seat_ids.includes(id)),
        })),
        seats: chosen.map(({ id, section, row, label }) => ({ id, section, row, label })),
      };
      saveSeatCart(cart);
      navigate(`/events/${encodeURIComponent(eventId)}/checkout`);
    } catch (caught) {
      // Never leave half a booking held: give back whatever was already taken.
      await Promise.allSettled(
        made.map((id) => request(`${path}/holds/${encodeURIComponent(id)}`, { method: "DELETE" })),
      );
      setError(caught instanceof ApiError && caught.status === 409 ? "justTaken" : "holdFailed");
      setPicked((old) => (caught instanceof ApiError && caught.status === 409 ? [] : old));
      reloadMap();
      reloadOffers();
    } finally {
      setBusy(false);
    }
  }

  const loading = !map.data && !map.error;
  return (
    <section className="seat-booking">
      <Link className="back-link" to={`/events/${encodeURIComponent(eventId)}`}>
        {t.back}
      </Link>
      <header className="seat-booking-head">
        <h1>{t.pickTitle}</h1>
        {event.data && (
          <p>
            <strong>{event.data.title}</strong>
            <span>{formatEventDateTime(event.data.starts_at, event.data.timezone, locale)}</span>
          </p>
        )}
      </header>

      {!!(map.error || offers.error) && (
        <p className="form-error" role="alert">
          {t.error}{" "}
          <button type="button" className="secondary" onClick={() => { reloadMap(); reloadOffers(); }}>
            {t.refresh}
          </button>
        </p>
      )}
      {loading && <p role="status">{t.loading}</p>}
      {map.data && seats.length === 0 && <p>{t.empty}</p>}

      {seats.length > 0 && (
        <div className="seat-booking-layout">
          <div className="seat-hall-wrap">
            <ul className="seat-legend" aria-label={t.map}>
              {categories.map((category) => (
                <li key={category ?? "none"}>
                  <span className="seat-swatch" data-tone={tone(category)} aria-hidden="true" />
                  {categoryLabelOf(category, locale)}
                  <strong>{priceOf(category) ?? t.notForSale}</strong>
                </li>
              ))}
              <li>
                <span className="seat-swatch is-picked" aria-hidden="true" />
                {t.selected}
              </li>
              <li>
                <span className="seat-swatch is-taken" aria-hidden="true" />
                {t.taken}
              </li>
            </ul>
            <div className="seat-hall" role="group" aria-label={t.map}>
              <div className="seat-stage" aria-hidden="true">
                <span>{t.stage}</span>
              </div>
              {sections.map((section) => (
                <section className="seat-section" key={section.name} aria-label={section.name}>
                  <h2>
                    {section.name}
                    {priceOf(section.category) && <span>{priceOf(section.category)}</span>}
                  </h2>
                  {section.rows.map((row) => (
                    <div className="seat-row" key={row.label}>
                      <span className="seat-row-label" aria-hidden="true">{row.label}</span>
                      <div className="seat-row-seats">
                        {row.seats.map((seat) => {
                          const isPicked = picked.includes(seat.id) && seat.status === "available";
                          const forSale = seat.status === "available" && !!offerForSeat(seat, choices);
                          const state = isPicked
                            ? t.selected
                            : seat.status !== "available"
                              ? t.taken
                              : forSale
                                ? priceOf(seat.price_category)
                                : t.notForSale;
                          return (
                            <button
                              key={seat.id}
                              type="button"
                              className="seat"
                              data-tone={tone(seat.price_category)}
                              data-state={isPicked ? "picked" : forSale ? "free" : "taken"}
                              aria-pressed={isPicked}
                              disabled={!forSale || busy}
                              aria-label={`${t.row} ${row.label}, ${t.seat} ${seat.label}: ${state}${seat.accessible ? `, ${t.accessible}` : ""}`}
                              title={`${t.row} ${row.label}, ${t.seat} ${seat.label} · ${state}`}
                              onClick={() => toggle(seat)}
                            >
                              {seat.label}
                            </button>
                          );
                        })}
                      </div>
                      <span className="seat-row-label" aria-hidden="true">{row.label}</span>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          </div>

          <aside className="seat-summary" aria-label={t.yourSeats}>
            <h2>
              {t.yourSeats}
              {chosen.length > 0 && <span>{chosen.length} / {maxSeats}</span>}
            </h2>
            {chosen.length === 0 ? (
              <p className="seat-summary-empty">{t.noSeatsYet}</p>
            ) : (
              <ul className="seat-summary-list">
                {chosen.map((seat) => (
                  <li key={seat.id}>
                    <span className="seat-swatch" data-tone={tone(seat.price_category)} aria-hidden="true" />
                    <span>
                      {t.row} {seat.row}, {t.seat} {seat.label}
                      <small>{seat.section}</small>
                    </span>
                    <strong>{priceOf(seat.price_category)}</strong>
                    <button
                      type="button"
                      className="seat-remove"
                      aria-label={`${t.remove}: ${t.row} ${seat.row}, ${t.seat} ${seat.label}`}
                      onClick={() => toggle(seat)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {limitHit && <p className="field-hint" role="status">{t.limitReached}</p>}
            {error && (
              <p className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
                {t[error]}
              </p>
            )}
            <div className="seat-summary-total">
              <span>{t.total}</span>
              <strong>{total === 0 && chosen.length ? t.free : formatPrice(total, locale)}</strong>
            </div>
            <button type="button" disabled={!chosen.length || busy} onClick={() => void book()}>
              {busy ? t.holding : user ? t.continue : t.signInToBook}
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
