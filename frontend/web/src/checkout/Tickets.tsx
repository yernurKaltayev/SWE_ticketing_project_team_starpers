import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { Status } from "../auth/ui";
import { commerceCopy } from "./copy";
import { CommerceError, CommerceStatus } from "./ui";
import {
  eventPath,
  parseEvent,
  parseTicket,
  parseTickets,
  ticketDetailPath,
  useCommerceQuery,
  usePagination,
  useTicketEvents,
} from "./data";
import { parseVenue, ticketPath, validateBinary } from "./model";
import { Pagination } from "./Orders";
import "./checkout.css";

export default function Tickets({ locale }: { locale: Locale }) {
  const t = commerceCopy[locale];
  const pagination = usePagination();
  const query = useCommerceQuery(
    `/api/v1/me/tickets?limit=20&offset=${pagination.offset}`,
    parseTickets,
  );
  const events = useTicketEvents(
    query.isError
      ? []
      : (query.data?.items.map((ticket) => ticket.event_id) ?? []),
  );
  return (
    <section>
      <div className="commerce-heading">
        <h1>{t.tickets}</h1>
        <Link to="/account/orders">{t.orders}</Link>
      </div>
      <CommerceError
        error={query.error}
        t={t}
        retry={() => {
          void query.refetch();
        }}
      />
      {query.isPending && <Status>{t.loading}</Status>}
      {query.data && !query.isError && (
        <>
          {!query.data.items.length && <Status>{t.emptyTickets}</Status>}
          <ul className="commerce-list">
            {query.data.items.map((ticket) => (
              <li key={ticket.id}>
                <div>
                  {events.get(ticket.event_id)?.data ? (
                    <>
                      <strong>
                        {events.get(ticket.event_id)!.data!.title}
                      </strong>
                      <p>
                        {formatEventDateTime(
                          events.get(ticket.event_id)!.data!.starts_at,
                          events.get(ticket.event_id)!.data!.timezone,
                          locale,
                        )}
                      </p>
                    </>
                  ) : (
                    <p className="field-hint">
                      {events.get(ticket.event_id)?.isPending
                        ? t.loading
                        : t.eventUnavailable}
                    </p>
                  )}
                  <Link
                    to={`/account/tickets/${encodeURIComponent(ticket.id)}`}
                  >
                    {ticket.ticket_number}
                  </Link>
                  <p>
                    {ticket.ticket_type} · {ticket.attendee_name}
                  </p>
                </div>
                <CommerceStatus value={ticket.status} t={t} />
              </li>
            ))}
          </ul>
          <Pagination {...pagination} total={query.data.total} t={t} />
        </>
      )}
      <Link to="/events">{t.back}</Link>
    </section>
  );
}

export function TicketDetail({ locale }: { locale: Locale }) {
  const { ticketId = "" } = useParams();
  return <TicketContent key={ticketId} ticketId={ticketId} locale={locale} />;
}
function TicketContent({
  ticketId,
  locale,
}: {
  ticketId: string;
  locale: Locale;
}) {
  const { user, controller } = useSession();
  const t = commerceCopy[locale];
  const query = useCommerceQuery(ticketDetailPath(ticketId), parseTicket);
  // A revoked/failed status read must not leave an old admission QR visible.
  const ticket = query.isError ? undefined : query.data;
  const event = useCommerceQuery(
    eventPath(ticket?.event_id ?? ""),
    parseEvent,
    !!ticket,
  );
  const venue = useCommerceQuery(
    `/api/v1/venues/${encodeURIComponent(event.data?.venue_id ?? "")}`,
    parseVenue,
    !!event.data,
  );
  const [downloadError, setDownloadError] = useState<unknown>(null);
  const [downloading, setDownloading] = useState(false);
  const active = useRef(true);
  const files = useRef(new Set<string>());
  useEffect(() => {
    active.current = true;
    const urls = files.current;
    return () => {
      active.current = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
      urls.clear();
    };
  }, []);
  const qr = useQuery({
    queryKey: ["f3-qr", user?.id, ticketId, ticket?.status],
    enabled: !!user && ticket?.status === "valid",
    retry: false,
    queryFn: async ({ signal }) =>
      validateBinary(
        await controller.request<Blob>(ticketPath(ticket!, "qr"), {
          signal,
          responseType: "blob",
          headers: { Accept: "image/png" },
        }),
        "qr",
      ),
  });
  const attachImage = useCallback(
    (node: HTMLImageElement | null) => {
      if (!node || !qr.data) return;
      const url = URL.createObjectURL(qr.data);
      node.src = url;
      return () => {
        node.removeAttribute("src");
        URL.revokeObjectURL(url);
      };
    },
    [qr.data],
  );
  async function download() {
    if (!ticket || downloading) return;
    const owner = user?.id;
    setDownloading(true);
    setDownloadError(null);
    try {
      const blob = validateBinary(
        await controller.request<Blob>(ticketPath(ticket, "pdf"), {
          responseType: "blob",
          headers: { Accept: "application/pdf" },
        }),
        "pdf",
      );
      if (!active.current || controller.getSnapshot().user?.id !== owner)
        return;
      const url = URL.createObjectURL(blob);
      files.current.add(url);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${ticket.ticket_number.replace(/[^a-z\d_-]/gi, "_").slice(0, 100)}.pdf`;
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(url);
        files.current.delete(url);
      }, 60000);
    } catch (error) {
      if (active.current) setDownloadError(error);
    } finally {
      if (active.current) setDownloading(false);
    }
  }
  return (
    <section>
      <Link to="/account/tickets">{t.tickets}</Link>
      <h1>{t.ticket}</h1>
      <CommerceError
        error={query.error}
        t={t}
        retry={() => {
          void query.refetch();
        }}
      />
      {query.isPending && <Status>{t.loading}</Status>}
      {ticket && (
        <div className="checkout-layout ticket-detail">
          <div>
            <p className="commerce-identifier">{ticket.ticket_number}</p>
            <CommerceStatus value={ticket.status} t={t} />
            <CommerceError
              error={event.error}
              t={t}
              retry={() => {
                void event.refetch();
              }}
            />
            {event.data && (
              <>
                <h2>{event.data.title}</h2>
                <p>
                  {formatEventDateTime(
                    event.data.starts_at,
                    event.data.timezone,
                    locale,
                  )}
                </p>
              </>
            )}
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
            <dl className="ticket-metadata">
              <div>
                <dt>{t.type}</dt>
                <dd>{ticket.ticket_type}</dd>
              </div>
              <div>
                <dt>{t.attendee}</dt>
                <dd>{ticket.attendee_name}</dd>
              </div>
              <div>
                <dt>{t.ticketId}</dt>
                <dd className="commerce-identifier">{ticket.id}</dd>
              </div>
              {ticket.seat && (
                <div>
                  <dt>{t.seat}</dt>
                  <dd>
                    {ticket.seat.section_name} · {ticket.seat.row_label} ·{" "}
                    {ticket.seat.seat_number}
                  </dd>
                </div>
              )}
            </dl>
            {ticket.status !== "valid" && <Status>{t.invalidTicket}</Status>}
            <CommerceError error={downloadError} t={t} />
            {ticket.status === "valid" && (
              <>
                <button
                  disabled={downloading}
                  onClick={() => {
                    void download();
                  }}
                >
                  {downloading ? t.working : t.download}
                </button>
                <p className="field-hint print-hint">{t.print}</p>
              </>
            )}
            <div className="controls">
              <button
                className="secondary"
                disabled={query.isFetching}
                onClick={() => {
                  void query.refetch();
                  if (ticket.status === "valid") void qr.refetch();
                }}
              >
                {query.isFetching ? t.working : t.refresh}
              </button>
            </div>
          </div>
          {ticket.status === "valid" && (
            <div className="ticket-qr">
              <h2>{t.qr}</h2>
              <CommerceError
                error={qr.error}
                t={t}
                retry={() => {
                  void qr.refetch();
                }}
              />
              {qr.isPending && <Status>{t.loading}</Status>}
              {qr.data && !qr.isError && (
                <img
                  ref={attachImage}
                  alt={`${t.qr} · ${ticket.ticket_number}`}
                  width={280}
                  height={280}
                />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
