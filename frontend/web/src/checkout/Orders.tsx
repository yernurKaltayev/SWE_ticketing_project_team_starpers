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
import { DemoCardPayment } from "../payments/DemoCardPayment";
import { paymentCopy } from "../payments/copy";
import "./checkout.css";
import { BackLink } from "../BackLink";
import { cityLabel } from "../events/venues";
import { ArrowRightIcon, CheckIcon, TicketIcon } from "../icons";

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
    <section className="reading-page">
      <h1>{t.orders}</h1>
      <nav className="controls" aria-label={`${t.tickets} / ${t.orders}`}>
        <Link to="/account/tickets" aria-current={undefined}>
          {t.tickets}
        </Link>
        <Link to="/account/orders" aria-current={"page"}>
          {t.orders}
        </Link>
      </nav>
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
          {!query.data.items.length && (
            <div className="empty-state" role="status">
              <p>{t.emptyOrders}</p>
              <Link className="action-link" to="/events">
                {t.back}
              </Link>
            </div>
          )}
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
    <section className="order-page">
      <BackLink to="/account/orders">{t.orders}</BackLink>
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
        <div className="order-layout">
          <aside className="order-summary">
          {eventOf(order) && (
            <OrderEvent eventId={eventOf(order)!} locale={locale} calendar={false} />
          )}
          <div className="order-meta">
            <span className="commerce-identifier">{order.order_number}</span>
            <span className="order-badges">
              <CommerceStatus value={order.status} t={t} />
              {/* Free registrations involve no money, simulated or not. */}
              {order.is_simulated && order.total > 0 && (
                <span className="status-badge" data-tone="neutral">{t.simulated}</span>
              )}
            </span>
          </div>
          {order.subtotal > 0 && <OrderTotals order={order} locale={locale} />}
          </aside>
          <div className="order-main">
          {preparing && <Status>{t.preparing}</Status>}
          {order.status === "pending" && order.total === 0 && (
            <Status>{paymentCopy[locale].pending}</Status>
          )}
          {order.status === "pending" && order.total > 0 && (
            <DemoCardPayment
              orderId={orderId}
              total={order.total}
              locale={locale}
            />
          )}
          {order.status === "paid" && (
            <div className="order-success" role="status">
              <span className="order-success-icon" aria-hidden="true">
                <CheckIcon size={20} />
              </span>
              <div>
                <strong>{paymentCopy[locale].paidTitle}</strong>
                <p>{paymentCopy[locale].paidHint}</p>
              </div>
              <Link className="order-success-link" to="/account/tickets">
                {paymentCopy[locale].allTickets}
                <ArrowRightIcon size={16} />
              </Link>
            </div>
          )}
          {["failed", "expired", "cancelled"].includes(order.status) && (
            <p>
              <Link className="action-link ghost" to="/events">{t.back}</Link>
            </p>
          )}
          {/* A pending paid order shows the Pay form, which refreshes the order itself. */}
          {poll && polls >= 10 && !(order.status === "pending" && order.total > 0) && (
            <p role="status">{t.pollEnded}</p>
          )}
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
          <h2 className="order-tickets-title">
            {t.orderTickets}
            {order.tickets.length > 0 && (
              <span className="order-tickets-count">{order.tickets.length}</span>
            )}
          </h2>
          <ul className="commerce-list order-tickets">
            {order.tickets.map((ticket) => (
              <li key={ticket.id}>
                <span className="order-ticket-icon" aria-hidden="true">
                  <TicketIcon size={20} />
                </span>
                <div>
                  <Link
                    className="row-link"
                    to={`/account/tickets/${encodeURIComponent(ticket.id)}`}
                  >
                    {ticket.attendee_name}
                  </Link>
                  <p>
                    {ticket.ticket_type} ·{" "}
                    <span className="commerce-identifier">{ticket.ticket_number}</span>
                  </p>
                </div>
                <CommerceStatus value={ticket.status} t={t} />
                <ArrowRightIcon className="order-ticket-arrow" size={18} aria-hidden="true" />
              </li>
            ))}
          </ul>
          {!order.tickets.length && !preparing && <p>{t.emptyTickets}</p>}
          </>
          )}
          {confirmed && eventOf(order) && (
            <OrderEvent eventId={eventOf(order)!} locale={locale} calendar onlyCalendar />
          )}
          <p className="quiet-help">
            <SupportLink locale={locale} context={{ order_id: order.id }} />
          </p>
          </div>
        </div>
      )}
    </section>
  );
}

/** Which event the order is for; confirmed orders also offer calendar options (F11). */
function OrderEvent({
  eventId,
  locale,
  calendar,
  onlyCalendar = false,
}: {
  eventId: string;
  locale: Locale;
  calendar: boolean;
  onlyCalendar?: boolean;
}) {
  const event = useCommerceQuery(eventPath(eventId), parseEvent);
  const venue = useCommerceQuery(
    `/api/v1/venues/${encodeURIComponent(event.data?.venue_id ?? "")}`,
    parseVenue,
    !!event.data,
  );
  if (!event.data || event.isError) return null;
  if (onlyCalendar)
    return calendar ? (
      <CalendarActions event={event.data} venue={venue.data} locale={locale} />
    ) : null;
  const cover = event.data.images[0];
  return (
    <div className="order-event-card">
      {cover && <img className="order-event-cover" src={cover} alt="" />}
      <h2 className="order-event">
        <Link to={`/events/${encodeURIComponent(event.data.id)}`}>
          {event.data.title}
        </Link>
      </h2>
      <p>
        {formatEventDateTime(event.data.starts_at, event.data.timezone, locale)}
      </p>
      {venue.data && (
        <p>{[venue.data.name, cityLabel(venue.data.city, locale)].join(" · ")}</p>
      )}
      {calendar && (
        <CalendarActions event={event.data} venue={venue.data} locale={locale} />
      )}
    </div>
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
