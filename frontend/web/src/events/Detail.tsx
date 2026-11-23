import { CalendarActions } from "../calendar/CalendarActions";
import { ReportEvent } from "../insights/ReportEvent";
import { SupportLink } from "../support/ui";
import { PromotionBanner } from "../promotions/Banner";
import { checkoutLink } from "../promotions/model";
import { seatingCopy } from "../seating/copy";
import { Link, useParams, useLocation } from "react-router-dom";
import { formatEventDateTime, formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { useResource } from "./data";
import { eventCopy } from "./copy";
import { salesState } from "./model";
import type { Availability, Event, Venue } from "./model";
import { CoverArt, EventError, Image } from "./ui";
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
  const registration = [
    event.registration_opens_at,
    event.registration_closes_at,
  ].filter(Boolean);
  return (
    <>
      <PromotionBanner locale={locale} />
      {!preview &&
        event.status === "published" &&
        event.visibility !== "private" && (
          <ReportEvent id={event.id} locale={locale} />
        )}
      {!preview && (
        <p>
          <SupportLink locale={locale} context={{ event_id: event.id }} />
        </p>
      )}
      {preview && <Status>{t.previewHint}</Status>}
      <header className="detail-header">
        <h1>{event.title}</h1>
        <p className="meta-line">
          {event.category && (
            <span className="event-category">{event.category}</span>
          )}
          <span className="status-badge" data-tone={toneFor(event.status)}>
            {t[event.status as "draft"] ?? event.status}
          </span>
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
                  {formatEventDateTime(event.starts_at, event.timezone, locale)}{" "}
                  — {formatEventDateTime(event.ends_at, event.timezone, locale)}
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
          <div className="panel">
            <h2>{t.refund}</h2>
            <p>{t.policyGap}</p>
          </div>
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
                        : formatMoney(ticket.price_amount, locale)}
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
        </aside>
      </div>
    </>
  );
}
