import { seatingCopy } from "../seating/copy";
import { Link, useParams } from "react-router-dom";
import { formatEventDateTime, formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { useResource } from "./data";
import { eventCopy } from "./copy";
import { salesState } from "./model";
import type { Availability, Event, Venue } from "./model";
import { EventError, Image } from "./ui";
import { commerceNavigation } from "../checkout/navigation";
import { parseEvent, parsePublicAvailability, parseVenue } from "./contracts";

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
      <Link to={preview ? `/organizer/events/${eventId}/edit` : "/events"}>
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
  const venue = useResource<Venue>(
    `/api/v1/venues/${encodeURIComponent(event.venue_id)}`,
    parseVenue,
  );
  const tickets = useResource<Availability[]>(
    `/api/v1/events/${encodeURIComponent(event.id)}/availability`,
    parsePublicAvailability,
  );
  return (
    <>
      {preview && <Status>{t.previewHint}</Status>}
      <p className="event-category">{event.category}</p>
      <h1>{event.title}</h1>
      <p>
        <span className="status-badge">
          {t[event.status as "draft"] ?? event.status}
        </span>
      </p>
      <p>
        {formatEventDateTime(event.starts_at, event.timezone, locale)} —{" "}
        {formatEventDateTime(event.ends_at, event.timezone, locale)}
      </p>
      <EventError error={venue.error} t={t} retry={venue.reload} />
      {venue.data && (
        <p>
          {venue.data.name} · {venue.data.address} · {venue.data.city}
        </p>
      )}
      <div className="event-grid">
        {event.images.map((src) => (
          <Image key={src} src={src} title={event.title} />
        ))}
      </div>
      <p className="event-description">{event.description}</p>
      <h2>
        {t.registration_opens_at} / {t.registration_closes_at}
      </h2>
      {[event.registration_opens_at, event.registration_closes_at]
        .filter(Boolean)
        .map((date) => (
          <p key={date}>{formatEventDateTime(date!, event.timezone, locale)}</p>
        ))}
      {event.seating_mode === "assigned" && !preview && <p><Link to={`/events/${event.id}/seats`}>{seatingCopy[locale].title}</Link></p>}
      <h2>{t.tickets}</h2>
      <EventError error={tickets.error} t={t} retry={tickets.reload} />
      {!tickets.data && !tickets.error && <Status>{t.loading}</Status>}
      {tickets.data?.length === 0 && <p>{t.ticketEmpty}</p>}
      <ul className="ticket-list">
        {tickets.data?.map((ticket) => (
          <li key={ticket.ticket_type_id}>
            <strong>{ticket.name}</strong>
            <span>
              {ticket.price_amount === 0
                ? t.free
                : formatMoney(ticket.price_amount, locale)}
            </span>
            <span>
              {t.available}: {ticket.available}
            </span>
            <span className="status-badge">{t[salesState(event, ticket)]}</span>
          </li>
        ))}
      </ul>
      {!preview && (
        <p>
          <Link className="action-link" to={`/events/${event.id}/checkout`}>
            {commerceNavigation[locale].register}
          </Link>
        </p>
      )}
      <h2>{t.refund}</h2>
      <p>{t.policyGap}</p>
    </>
  );
}
