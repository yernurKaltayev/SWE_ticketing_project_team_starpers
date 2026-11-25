import { CalendarActions } from "../calendar/CalendarActions";
import { ReportEvent } from "../insights/ReportEvent";
import { supportLink } from "../support/model";
import { PromotionBanner } from "../promotions/Banner";
import { checkoutLink } from "../promotions/model";
import { seatingCopy } from "../seating/copy";
import { Link, useParams, useLocation } from "react-router-dom";
import { formatDateTime, formatEventDateTime, formatPrice, zoneLabel } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { useResource } from "./data";
import { eventCopy } from "./copy";
import { offerSummary, salesState } from "./model";
import type { Availability, Event, Venue } from "./model";
import { CoverArt, EventError, Image, RefundPolicy } from "./ui";
import { categoryLabel } from "./categories";
import { offerLabel } from "./offerLabel";
import { createPortal } from "react-dom";
import { commerceNavigation } from "../checkout/navigation";
import { parseEvent, parsePublicAvailability, parseVenue } from "./contracts";
import {
  ArrowLeftIcon,
  CalendarIcon,
  ClockIcon,
  PinIcon,
  SeatIcon,
  TicketIcon,
} from "../icons";
import { toneFor } from "../tone";

export function EventDetail({
  locale,
  preview = false,
}: {
  locale: Locale;
  preview?: boolean;
}) {
  const { eventId = "" } = useParams();
  const t = eventCopy[locale];
  const {
    data: event,
    error,
    reload,
  } = useResource<Event>(
    `/api/v1/events/${encodeURIComponent(eventId)}`,
    parseEvent,
  );
  return (
    <section>
      <Link
        className="back-link"
        to={preview ? `/organizer/events/${eventId}/edit` : "/events"}
      >
        <ArrowLeftIcon size={16} />
        {preview ? t.edit : t.back}
      </Link>
      <EventError error={error} t={t} retry={reload} />
      {!event && !error && <Status>{t.loading}</Status>}
      {event && (
        <EventContent
          key={event.id}
          event={event}
          locale={locale}
          preview={preview}
        />
      )}
    </section>
  );
}
function EventContent({
  event,
  locale,
  preview,
}: {
  event: Event;
  locale: Locale;
  preview: boolean;
}) {
  const t = eventCopy[locale];
  const location = useLocation();
  const venue = useResource<Venue>(
    `/api/v1/venues/${encodeURIComponent(event.venue_id)}`,
    parseVenue,
  );
  const tickets = useResource<Availability[]>(
    `/api/v1/events/${encodeURIComponent(event.id)}/availability`,
    parsePublicAvailability,
  );
  const offer = tickets.data ? offerSummary(tickets.data) : null;
  const registration = [
    event.registration_opens_at,
    event.registration_closes_at,
  ].filter(Boolean);
  return (
    <>
      <PromotionBanner locale={locale} />
      {preview && <Status>{t.previewHint}</Status>}
      <header className="detail-header">
        <h1>{event.title}</h1>
        <p className="meta-line">
          {event.category && (
            <span className="event-category">
              {categoryLabel(event.category, locale)}
            </span>
          )}
          {/* "Published" is the normal state and means nothing to a buyer; only
              draft (preview) and cancelled are worth a badge. */}
          {event.status !== "published" && (
            <span className="status-badge" data-tone={toneFor(event.status)}>
              {t[event.status as "draft"] ?? event.status}
            </span>
          )}
        </p>
      </header>
      <div className="detail-layout">
        <div className="detail-main">
          {event.images.length === 0 && (
            <div className="event-cover detail-cover">
              <CoverArt event={event} locale={locale} />
            </div>
          )}
          <div className="event-grid">
            {event.images.map((src) => (
              <Image key={src} src={src} title={event.title} />
            ))}
          </div>
          <div className="panel">
            <dl className="facts">
              <div>
                <span className="fact-icon">
                  <CalendarIcon />
                </span>
                <dt>
                  {t.starts_at} — {t.ends_at}
                </dt>
                <dd>
                  {eventRange(event.starts_at, event.ends_at, event.timezone, locale)}
                </dd>
              </div>
              {venue.data && (
                <div>
                  <span className="fact-icon">
                    <PinIcon />
                  </span>
                  <dt>{t.venue_id}</dt>
                  <dd>
                    {venue.data.name} · {venue.data.address} · {venue.data.city}
                  </dd>
                </div>
              )}
              {registration.length > 0 && (
                <div>
                  <span className="fact-icon">
                    <ClockIcon />
                  </span>
                  <dt>
                    {t.registration_opens_at} / {t.registration_closes_at}
                  </dt>
                  {registration.map((date) => (
                    <dd key={date}>
                      {formatEventDateTime(date!, event.timezone, locale)}
                    </dd>
                  ))}
                </div>
              )}
            </dl>
            <EventError error={venue.error} t={t} retry={venue.reload} />
          </div>
          {event.description && (
            <div className="panel">
              <h2>{t.description}</h2>
              <p className="event-description">{event.description}</p>
            </div>
          )}
          <RefundPolicy event={event} locale={locale} />
        </div>
        <aside className="detail-aside">
          <div className="panel ticket-panel">
            <h2>{t.tickets}</h2>
            <EventError error={tickets.error} t={t} retry={tickets.reload} />
            {!tickets.data && !tickets.error && <Status>{t.loading}</Status>}
            {tickets.data?.length === 0 && <p>{t.ticketEmpty}</p>}
            <ul className="ticket-list">
              {tickets.data?.map((ticket) => {
                const state = salesState(event, ticket);
                return (
                  <li key={ticket.ticket_type_id}>
                    <strong>{ticket.name}</strong>
                    <span className="price">
                      {ticket.price_amount === 0
                        ? t.free
                        : formatPrice(ticket.price_amount, locale)}
                    </span>
                    {/* Closed tickets report 0, which is not a real count. */}
                    {state === "onSale" || state === "soldOut" ? (
                      <span className="availability">
                        {t.available}: {ticket.available}
                      </span>
                    ) : null}
                    <span className="status-badge" data-tone={toneFor(state)}>
                      {t[state]}
                    </span>
                  </li>
                );
              })}
            </ul>
            {!preview && event.status === "published" && (
              <Link
                className="action-link"
                to={checkoutLink(event.id, location.search)}
              >
                <TicketIcon />
                {commerceNavigation[locale].register}
              </Link>
            )}
          </div>
          {event.seating_mode === "assigned" && !preview && (
            <Link
              className="action-link ghost"
              to={`/events/${event.id}/seats`}
            >
              <SeatIcon />
              {seatingCopy[locale].title}
            </Link>
          )}
          {!preview && (
            <CalendarActions event={event} venue={venue.data} locale={locale} />
          )}
          {!preview && (
            <section className="panel help-panel" aria-labelledby="event-help-title">
              <h2 id="event-help-title">{t.helpTitle}</h2>
              <p>{t.helpHint}</p>
              <Link
                className="action-link ghost"
                to={supportLink({ event_id: event.id })}
              >
                {t.helpSupport}
              </Link>
              {event.status === "published" && event.visibility !== "private" && (
                <ReportEvent id={event.id} locale={locale} />
              )}
            </section>
          )}
        </aside>
      </div>
      {!preview &&
        event.status === "published" &&
        !offer?.soldOut &&
        // Phones: the ticket panel sits below the description, so keep the
        // primary action reachable. Portalled to <body> because the page
        // wrapper animates with a transform, which would trap position:fixed.
        createPortal(
        <div className="mobile-cta">
          {offer && <span className="price">{offerLabel(offer, locale)}</span>}
          <Link
            className="action-link"
            to={checkoutLink(event.id, location.search)}
          >
            <TicketIcon />
            {commerceNavigation[locale].register}
          </Link>
        </div>,
        document.body,
      )}
    </>
  );
}

/** "13 дек. 2026 г., 21:30 — 23:30 · Алматы": the zone once, the end day only if it differs. */
function eventRange(start: string, end: string, zone: string, locale: Locale) {
  const day = (v: string) => formatDateTime(v, locale, { timeZone: zone });
  const from = formatDateTime(start, locale, { time: true, timeZone: zone });
  const to =
    day(start) === day(end)
      ? new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: zone }).format(new Date(end))
      : formatDateTime(end, locale, { time: true, timeZone: zone });
  return `${from} — ${to} · ${zoneLabel(zone, locale)}`;
}
