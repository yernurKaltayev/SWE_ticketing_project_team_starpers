import { CalendarActions } from "../calendar/CalendarActions";
import { SupportLink } from "../support/ui";
import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatEventDateTime, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { commerceCopy } from "./copy";
import type { CommerceCopy } from "./copy";
import { CommerceError, CommerceStatus } from "./ui";
import {
  eventPath,
  orderPath,
  parseEvent,
  parseOrder,
  parseOrders,
  useCommerceQuery,
  usePagination,
  useTicketEvents,
} from "./data";
import { parseVenue } from "./model";
import type { Order } from "./model";
import { PaymentPanel } from "../payments/PaymentPanel";
import { paymentCopy } from "../payments/copy";
import "./checkout.css";

// Older API builds sent no event_id; tickets of one order share one event.
const eventOf = (order: Order): string | undefined =>
  order.event_id || order.tickets[0]?.event_id;

export function Pagination({
  offset,
  total,
  change,
  t,
}: {
  offset: number;
  total: number;
  change: (n: number) => void;
  t: CommerceCopy;
}) {
  // One page of results needs no pager.
  if (offset === 0 && total <= 20) return null;
  return (
    <nav className="controls" aria-label={t.previous + " / " + t.next}>
      <button
        className="secondary"
        disabled={!offset}
        onClick={() => change(offset - 20)}
      >
        {t.previous}
      </button>
      <button
        className="secondary"
        disabled={offset + 20 >= total}
        onClick={() => change(offset + 20)}
      >
        {t.next}
      </button>
    </nav>
  );
}
export default function Orders({ locale }: { locale: Locale }) {
  const t = commerceCopy[locale];
  const pagination = usePagination();
  const query = useCommerceQuery(
    `/api/v1/me/orders?limit=20&offset=${pagination.offset}`,
    parseOrders,
  );
  const events = useTicketEvents(
    query.isError
      ? []
      : (query.data?.items.map(eventOf).filter((id): id is string => !!id) ??
          []),
  );
  return (
    <section>
      <div className="commerce-heading">
        <h1>{t.orders}</h1>
        <Link to="/account/tickets">{t.tickets}</Link>
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
          {!query.data.items.length && <Status>{t.emptyOrders}</Status>}
          <ul className="commerce-list">
            {query.data.items.map((order) => (
              <li key={order.id}>
                <div>
                  <Link
                    className="row-link"
                    to={`/account/orders/${encodeURIComponent(order.id)}`}
                  >
                    {(eventOf(order) &&
                      events.get(eventOf(order)!)?.data?.title) ||
                      order.order_number}
                  </Link>
                  <p>
                    <span className="commerce-identifier">
                      {order.order_number}
                    </span>{" "}
                    · {t.tickets}: {order.tickets.length}
                  </p>
                  {order.is_simulated && order.total > 0 && (
                    <span className="status-badge">{t.simulated}</span>
                  )}
                </div>
                <CommerceStatus value={order.status} t={t} />
                <strong>
                  {formatPrice(order.total, locale, order.currency)}
                </strong>
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

export function OrderDetail({ locale }: { locale: Locale }) {
  const { orderId = "" } = useParams();
  return <OrderContent key={orderId} orderId={orderId} locale={locale} />;
}
function OrderContent({
  orderId,
  locale,
}: {
  orderId: string;
  locale: Locale;
}) {
  const t = commerceCopy[locale];
  const query = useCommerceQuery(orderPath(orderId), parseOrder);
  const { refetch, dataUpdatedAt, isFetching } = query;
  const [polls, setPolls] = useState(0);
  const order = query.isError ? undefined : query.data;
  const count = order?.items.reduce((sum, i) => sum + i.quantity, 0) ?? 0;
  const confirmed = order && ["free_confirmed", "paid"].includes(order.status);
  const preparing = confirmed && order.tickets.length < count;
  const poll = order?.status === "pending" || preparing;
  useEffect(() => {
    if (!poll || polls >= 10 || isFetching) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "hidden") {
        setPolls((n) => n + 1);
        void refetch();
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [poll, polls, dataUpdatedAt, isFetching, refetch]);
  return (
    <section>
      <Link to="/account/orders">{t.orders}</Link>
      <h1>{order?.status === "free_confirmed" ? t.confirmed : t.order}</h1>
      <CommerceError
        error={query.error}
        t={t}
        retry={() => {
          void query.refetch();
        }}
      />
      {query.isPending && <Status>{t.loading}</Status>}
      {order && (
        <>
          {eventOf(order) && (
            <OrderEvent
              eventId={eventOf(order)!}
              locale={locale}
              calendar={!!confirmed}
            />
          )}
          <p>
            <span className="commerce-identifier">{order.order_number}</span>{" "}
            <CommerceStatus value={order.status} t={t} />
          </p>
          {/* Free registrations involve no money, simulated or not. */}
          {order.is_simulated && order.total > 0 && (
            <p className="notice">{t.simulated}</p>
          )}
          {order.subtotal > 0 && <OrderTotals order={order} locale={locale} />}
          {confirmed && <p className="field-hint">{t.emailNote}</p>}
          {preparing && <Status>{t.preparing}</Status>}
          {order.status === "pending" && (
            <Status>{paymentCopy[locale].pending}</Status>
          )}
          {order.status === "pending" && order.total > 0 && (
            <PaymentPanel
              locale={locale}
              kind="ticket"
              amount={order.total}
              startPath={`${orderPath(orderId)}/payments`}
            />
          )}
          {["failed", "expired", "cancelled"].includes(order.status) && (
            <p>
              <Link to="/events">{t.back}</Link>
            </p>
          )}
          {poll && polls >= 10 && <p role="status">{t.pollEnded}</p>}
          {/* A pending paid order has the payment panel's own refresh. */}
          {poll && !(order.status === "pending" && order.total > 0) && (
          <div className="controls">
            <button
              disabled={query.isFetching}
              className="secondary"
              onClick={() => {
                setPolls(0);
                void query.refetch();
              }}
            >
              {query.isFetching ? t.working : t.check}
            </button>
          </div>
          )}
          {(confirmed || order.tickets.length > 0) && (
          <>
          <h2>{t.tickets}</h2>
          <ul className="commerce-list">
            {order.tickets.map((ticket) => (
              <li key={ticket.id}>
                <div>
                  <Link
                    className="row-link"
                    to={`/account/tickets/${encodeURIComponent(ticket.id)}`}
                  >
                    {ticket.ticket_type} · {ticket.attendee_name}
                  </Link>
                  <p className="commerce-identifier">{ticket.ticket_number}</p>
                </div>
                <CommerceStatus value={ticket.status} t={t} />
              </li>
            ))}
          </ul>
          {!order.tickets.length && !preparing && <p>{t.emptyTickets}</p>}
          </>
          )}
          <p className="quiet-help">
            <SupportLink locale={locale} context={{ order_id: order.id }} />
          </p>
        </>
      )}
    </section>
  );
}

/** Which event the order is for; confirmed orders also offer calendar options (F11). */
function OrderEvent({
  eventId,
  locale,
  calendar,
}: {
  eventId: string;
  locale: Locale;
  calendar: boolean;
}) {
  const event = useCommerceQuery(eventPath(eventId), parseEvent);
  const venue = useCommerceQuery(
    `/api/v1/venues/${encodeURIComponent(event.data?.venue_id ?? "")}`,
    parseVenue,
    !!event.data,
  );
  if (!event.data || event.isError) return null;
  return (
    <>
      <h2 className="order-event">
        <Link to={`/events/${encodeURIComponent(event.data.id)}`}>
          {event.data.title}
        </Link>
      </h2>
      <p>
        {formatEventDateTime(event.data.starts_at, event.data.timezone, locale)}
        {venue.data && ` · ${venue.data.name}`}
      </p>
      {calendar && (
        <CalendarActions event={event.data} venue={venue.data} locale={locale} />
      )}
    </>
  );
}

function OrderTotals({ order, locale }: { order: Order; locale: Locale }) {
  const t = commerceCopy[locale];
  return (
    <dl className="commerce-totals">
      {(
        [
          [t.subtotal, order.subtotal],
          [t.discount, order.discount_amount],
          [t.fee, order.processing_fee],
          [t.total, order.total],
        ] as const
      )
        // Zero discount/fee rows are noise; subtotal and total always show.
        .filter(([label, value], i) => value !== 0 || i === 0 || i === 3 || !label)
        .map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{formatPrice(value, locale, order.currency)}</dd>
        </div>
      ))}
    </dl>
  );
}
