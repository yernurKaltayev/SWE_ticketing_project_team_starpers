import { cityLabel } from "./venues";
import { CalendarActions } from "../calendar/CalendarActions";
import { ReportEvent } from "../insights/ReportEvent";
import { supportLink } from "../support/model";
import { PromotionBanner } from "../promotions/Banner";
import { checkoutLink } from "../promotions/model";
import { seatingCopy } from "../seating/copy";
import { Link, useParams, useLocation } from "react-router-dom";
import { formatEventDateTime, formatEventRange, formatPrice } from "@biletflow/shared";
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
import { commerceAction } from "../checkout/navigation";
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
  // Numbered seats are chosen on the hall plan first; checkout then takes the held seats.
  const seated = event.seating_mode === "assigned";
  const buyLink = seated
    ? `/events/${encodeURIComponent(event.id)}/seats`
    : checkoutLink(event.id, location.search);
  // One sales window for the whole event. Without a close date, sales stop when the event
  // starts (the backend enforces the same rule).
  const salesCloseAt = event.registration_closes_at ?? event.starts_at;
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
                  {t.when}
                </dt>
                <dd>
                  {formatEventRange(event.starts_at, event.ends_at, event.timezone, locale)}
                </dd>
              </div>
              {venue.data && (
                <div>
                  <span className="fact-icon">
                    <PinIcon />
                  </span>
                  <dt>{t.venue_id}</dt>
                  <dd>
                    {venue.data.name} · {venue.data.address} · {cityLabel(venue.data.city, locale)}
                  </dd>
                </div>
              )}
              {event.status !== "cancelled" && (
                <div>
                  <span className="fact-icon">
                    <ClockIcon />
                  </span>
                  <dt>{t.salesWindow}</dt>
                  {event.registration_opens_at && (
                    <dd>
                      {t.salesOpens}:{" "}
                      {formatEventDateTime(
                        event.registration_opens_at,
                        event.timezone,
                        locale,
                      )}
                    </dd>
                  )}
                  <dd>
                    {t.salesCloses}:{" "}
                    {formatEventDateTime(salesCloseAt, event.timezone, locale)}
                    {!event.registration_closes_at && ` (${t.salesCloseAtStart})`}
                  </dd>
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
                    {state !== "ended" && state !== "cancelled" ? (
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
              <Link className="action-link" to={buyLink}>
                {seated ? <SeatIcon /> : <TicketIcon />}
                {seated ? seatingCopy[locale].chooseSeats : commerceAction(locale, offer?.allFree)}
              </Link>
            )}
          </div>
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
          <Link className="action-link" to={buyLink}>
            {seated ? <SeatIcon /> : <TicketIcon />}
            {seated ? seatingCopy[locale].chooseSeats : commerceAction(locale, offer?.allFree)}
          </Link>
        </div>,
        document.body,
      )}
    </>
  );
}

