import { useEffect, useState } from "react";
import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { commerceCopy } from "@biletflow/shared/features/checkout/copy";
import { parseEvent, parseOrder, parsePage } from "@biletflow/shared/features/checkout/model";
import { queryKeys } from "@biletflow/shared/features/query-keys";
import { supportCopy } from "@biletflow/shared/features/support/copy";
import { supportLink } from "@biletflow/shared/features/support/model";
import { Read, useResource } from "../features/resource";
import { RecordPage } from "../features/PageNav";
import { useSessionSnapshot } from "../session";
import { Action, Body, Callout, Card, Heading, Muted, Pill, Screen, Title } from "../ui";
import { Payment } from "./Payment";

type Props = { locale: Locale; open: (path: string) => void };

export function Orders({ locale, open }: Props) {
  const t = commerceCopy[locale];
  const { user } = useSessionSnapshot();
  const [offset, setOffset] = useState(0);
  const path = `/api/v1/me/orders?limit=20&offset=${offset}`;
  const resource = useResource(path, (value) => parsePage(value, parseOrder), { key: queryKeys.commerce(user?.id, path) });
  return <RecordPage title={t.orders} empty={t.emptyOrders} locale={locale} resource={resource} change={setOffset}
    render={(order) => <Card key={order.id}>
      <Heading>{order.order_number}</Heading>
      <Pill label={t.states[order.status] ?? t.unknownStatus} />
      <Body>{formatPrice(order.total, locale, order.currency)}</Body>
      <Action title={t.view} onPress={() => open(`/account/orders/${encodeURIComponent(order.id)}`)} />
    </Card>} />;
}

/** Current time, ticking every second while active. */
function useNow(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}
const clock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

export function Order({ id, locale, open }: Props & { id: string }) {
  const t = commerceCopy[locale];
  const { user } = useSessionSnapshot();
  const path = `/api/v1/orders/${encodeURIComponent(id)}`;
  const resource = useResource(path, parseOrder, { key: queryKeys.commerce(user?.id, path), interval: 5000 });
  const eventId = resource.data?.event_id || resource.data?.tickets[0]?.event_id;
  const event = useResource(eventId ? `/api/v1/events/${encodeURIComponent(eventId)}` : "", parseEvent);
  // A paid order waiting for payment holds its tickets until expires_at.
  const raw = resource.data;
  const deadline = raw?.status === "pending" && raw.total > 0 && raw.expires_at ? Date.parse(raw.expires_at) : null;
  const now = useNow(deadline !== null);
  const left = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000));
  const { refetch } = resource;
  useEffect(() => {
    if (left === 0) void refetch();
  }, [left, refetch]);
  return <Screen>
    <Title>{t.order}</Title>
    <Read resource={resource} locale={locale}>{(fetched) => {
      // Shown as expired the moment the reservation runs out; the refetch brings the server status.
      const order = left === 0 ? { ...fetched, status: "expired" } : fetched;
      return <>
      <Heading>{order.order_number}</Heading>
      <Pill label={t.states[order.status] ?? t.unknownStatus} />
      {event.data ? <Action title={event.data.title} onPress={() => open(`/events/${encodeURIComponent(event.data!.id)}`)} /> : null}
      <Card>
        <Muted>{t.subtotal} {formatPrice(order.subtotal, locale, order.currency)}</Muted>
        {order.discount_amount ? <Muted>{t.discount} {formatPrice(order.discount_amount, locale, order.currency)}</Muted> : null}
        {order.processing_fee ? <Muted>{t.fee} {formatPrice(order.processing_fee, locale, order.currency)}</Muted> : null}
        <Body>{t.total} {formatPrice(order.total, locale, order.currency)}</Body>
      </Card>
      {order.status === "pending" && order.total > 0 && left !== null ?
        <Callout tone={left < 60 ? "danger" : "info"} title={`${t.reservedFor} ${clock(left)}`}>{t.reservedHint}</Callout> : null}
      {order.status === "failed" || order.status === "expired" || order.status === "cancelled" ? <>
        <Callout tone={order.status === "failed" ? "danger" : "warning"} title={t[`${order.status}Title`]}>
          {t[`${order.status}Hint`]}
        </Callout>
        {order.status !== "cancelled" && eventId ?
          <Action title={t.tryAgain} variant="primary" onPress={() => open(`/events/${encodeURIComponent(eventId)}/checkout`)} /> : null}
      </> : null}
      {order.status === "pending" && order.total > 0 ?
        <Payment startPath={`${path}/payments`} kind="ticket" amount={order.total} locale={locale} changed={resource.refetch} /> : null}
      {order.status === "pending" && order.total === 0 ? <Muted>{t.pending}</Muted> : null}
      {order.status === "paid" || order.status === "free_confirmed" ? <>
        <Heading>{t.tickets}</Heading>
        {order.tickets.length ? order.tickets.map((ticket) => <Action key={ticket.id} title={ticket.ticket_number}
          onPress={() => open(`/account/tickets/${encodeURIComponent(ticket.id)}`)} />) : <Muted>{t.preparing}</Muted>}
      </> : null}
      <Action title={t.refresh} disabled={resource.isFetching} onPress={() => void resource.refetch()} />
      <Action title={supportCopy[locale].contact} onPress={() => open(supportLink({ order_id: id }))} />
    </>;
    }}</Read>
  </Screen>;
}
