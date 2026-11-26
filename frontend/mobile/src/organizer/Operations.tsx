import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, formatPrice } from "@biletflow/shared";
import { parseOrder } from "@biletflow/shared/features/checkout/model";
import { parseEvent, parseTicketTypes } from "@biletflow/shared/features/events/contracts";
import { operationsCopy } from "@biletflow/shared/features/operations/copy";
import {
  canCancel, canRefund, definiteFailure, eventRoot, filterOrders, impact, loadOrders,
  OperationJournal, ordersCsv, parseAttendees, parseRefund, parseRefunds, resolved,
} from "@biletflow/shared/features/operations/model";
import type { Action as Operation, Order } from "@biletflow/shared/features/operations/model";
import { afterRefundScopes, queryKeys } from "@biletflow/shared/features/query-keys";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { secureStorage } from "../checkout/state";
import { PageNav } from "../features/PageNav";
import { Failure, Read, request, useResource } from "../features/resource";
import { downloadAndShare, shareCsv } from "../files";
import { Select } from "../kit/Select";
import { useSessionSnapshot } from "../session";
import { Action, Body, Callout, Card, Heading, Muted, Pill, Screen, Sheet, Title } from "../ui";
import { organizerEvent } from "./Events";
import type { OrganizerProps } from "./Events";

type ViewName = "orders" | "attendees" | "refunds";
const statuses = ["pending", "free_confirmed", "paid", "cancelled", "refunded", "failed", "expired"] as const;
const ticketStatuses = ["valid", "checked_in", "cancelled", "refunded"] as const;

export function Operations({ id, orderId, initialView, locale, open }: OrganizerProps & {
  id: string; orderId?: string; initialView?: string;
}) {
  const t = operationsCopy[locale];
  const { user } = useSessionSnapshot();
  const cache = useQueryClient();
  const [view, setView] = useState<ViewName>(initialView === "attendees" || initialView === "refunds" ? initialView : "orders");
  const [offset, setOffset] = useState(0);
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [selected, setSelected] = useState<Operation | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<unknown>(null);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const lock = useRef(false);
  const exportLock = useRef(false);
  const root = eventRoot(id);
  const event = useResource(root, parseEvent);
  const orders = useQuery({
    queryKey: queryKeys.operationsOrders(user?.id, id),
    queryFn: ({ signal }) => loadOrders(request, id, signal),
  });
  const types = useResource(view === "attendees" ? `${root}/ticket-types` : "", parseTicketTypes);
  const filters = new URLSearchParams();
  if (term.trim()) filters.set("q", term.trim());
  if (status) filters.set("status", status);
  if (type) filters.set("ticket_type_id", type);
  const attendees = useResource(view === "attendees" ? `${root}/attendees?limit=20&offset=${offset}&${filters}` : "", parseAttendees);
  const refunds = useResource(`${root}/refunds?limit=20&offset=${view === "refunds" ? offset : 0}`, parseRefunds);
  const journal = useMemo(() => new OperationJournal(secureStorage, user?.id ?? "", id), [user?.id, id]);
  const [recovery, setRecovery] = useState<Operation | null>(() => {
    try { return journal.read(); } catch { return null; }
  });
  const discard = useDiscardChanges(Boolean(selected && reason.trim()), locale);

  function ask(kind: Operation["kind"], target: string) {
    setError(null);
    setResult(null);
    setReason("");
    setSelected({ kind, target });
  }

  async function reload() {
    const [current, list, refundsPage] = await Promise.all([event.refetch(), orders.refetch(), refunds.refetch()]);
    const data = [current, list, refundsPage].find((item) => item.isError);
    if (data) throw data.error;
    return { event: current.data!, orders: list.data!, refunds: refundsPage.data!.items };
  }

  async function check() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const pending = journal.read();
      const refreshed = await reload();
      if (pending && resolved(pending, refreshed.orders, refreshed.refunds, refreshed.event.status)) {
        journal.clear();
        setRecovery(null);
        setResult(t.done);
      } else if (pending) {
        setRecovery(pending);
        setResult(t.unresolved);
      }
    } catch (caught) { setError(caught); }
    finally { lock.current = false; setBusy(false); }
  }

  async function commit() {
    if (lock.current || !selected || !event.data || !orders.data) return;
    const action = selected;
    lock.current = true;
    setBusy(true);
    setError(null);
    let sent = false;
    let outcomeKnown = false;
    try {
      const orderPath = `/api/v1/orders/${encodeURIComponent(action.target)}`;
      if (action.kind === "event") {
        const fresh = await reload();
        if (fresh.event.status !== event.data.status ||
          JSON.stringify(impact(fresh.orders)) !== JSON.stringify(impact(orders.data))) {
          throw new ApiError(409, "snapshot_changed", t.changed);
        }
      } else {
        const prior = orders.data.find((item) => item.id === action.target);
        const next = parseOrder(await request(orderPath));
        if (!prior || next.id !== prior.id || next.status !== prior.status || next.total !== prior.total ||
          !(action.kind === "refund" ? canRefund(next) : canCancel(next))) {
          throw new ApiError(409, "snapshot_changed", t.changed);
        }
      }
      journal.begin(action);
      sent = true;
      setRecovery(action);
      const refunding = action.kind === "refund";
      const value = await request(action.kind === "event" ? `${root}/cancel` : `${orderPath}/${action.kind}`, {
        method: "POST", ...(refunding ? { body: { reason: reason.trim() } } : {}),
      });
      if (refunding) {
        const refund = parseRefund(value);
        if (refund.order_id !== action.target) throw new Error("wrong refund");
        if (refund.status === "pending") {
          const pending = { ...action, refundId: refund.id };
          journal.retain(pending);
          setRecovery(pending);
          setResult(t.pendingResult);
        } else {
          journal.clear();
          setRecovery(null);
          setResult(refund.status === "completed" ? t.done : t.failedResult);
        }
      } else {
        const cancelled = action.kind === "event" ? parseEvent(value) : parseOrder(value);
        if (cancelled.id !== action.target || cancelled.status !== "cancelled") throw new Error("invalid cancellation");
        journal.clear();
        setRecovery(null);
        setResult(t.done);
      }
      outcomeKnown = true;
      await Promise.all(afterRefundScopes.map((key) => cache.invalidateQueries({ queryKey: [key] })));
      await reload();
    } catch (caught) {
      setError(caught);
      if (sent && !outcomeKnown && definiteFailure(caught)) {
        journal.clear();
        setRecovery(null);
      } else if (sent && !outcomeKnown) setResult(t.unknown);
    } finally {
      setSelected(null);
      setReason("");
      lock.current = false;
      setBusy(false);
    }
  }

  async function exportRows() {
    if (exportLock.current) return;
    exportLock.current = true;
    setExporting(true);
    setError(null);
    try {
      if (view === "attendees") {
        if (await downloadAndShare(`${root}/attendees.csv?${filters}`, `attendees-${id}`, "csv") === "unavailable") {
          throw new Error("sharing unavailable");
        }
      } else {
        const latest = await loadOrders(request, id);
        await shareCsv(`orders-${id}`, ordersCsv(filterOrders(latest, term, status)));
      }
    } catch (caught) { setError(caught); }
    finally { exportLock.current = false; setExporting(false); }
  }

  const statusLabel = (value: string) => t.state[value as keyof typeof t.state] ?? t.state.unknown;
  function orderCard(order: Order, expanded = false) {
    return <Card key={order.id}>
      <Heading>{order.order_number}</Heading>
      <Pill label={statusLabel(order.status)} />
      {order.is_simulated ? <Muted>{t.simulated}</Muted> : null}
      <Body>{t.total} {formatPrice(order.total, locale, order.currency)}</Body>
      {expanded ? <>
        {order.tickets.map((ticket) => <Muted key={ticket.id}>{ticket.attendee_name} · {ticket.ticket_number} · {statusLabel(ticket.status)}</Muted>)}
        {canCancel(order) ? <Action title={t.cancel} disabled={busy || Boolean(recovery)} onPress={() => ask("cancel", order.id)} /> : null}
        {canRefund(order) ? <Action title={t.refund} disabled={busy || Boolean(recovery)} onPress={() => ask("refund", order.id)} /> : null}
        {!canCancel(order) && !canRefund(order) ? <Muted>{t.noAction}</Muted> : null}
      </> : <Action title={t.details} onPress={() => open(organizerEvent(id, `orders/${encodeURIComponent(order.id)}`))} />}
    </Card>;
  }

  return <Screen>
    <Title>{orderId ? t.details : t.title}</Title>
    {event.data ? <Muted>{event.data.title}</Muted> : null}
    <Failure error={event.error ?? error} locale={locale} />
    {result ? <Callout tone={recovery ? "warning" : "info"}>{result}</Callout> : null}
    <Action title={recovery ? t.check : t.refresh} disabled={busy} busy={busy} onPress={() => void check()} />
    {orderId ? <Read resource={orders} locale={locale}>{(items) => {
      const item = items.find((row) => row.id === orderId);
      return item ? orderCard(item, true) : <Muted>{t.denied}</Muted>;
    }}</Read> : <>
      <Select label={t.title} locale={locale} value={view}
        options={(["orders", "attendees", "refunds"] as const).map((value) => ({ value, label: t[value] }))}
        onChange={(value) => { setView(value); setOffset(0); setTerm(""); setStatus(""); setType(""); }} />
      {view !== "refunds" ? <>
        <AuthField label={t.search} value={term} maxLength={100} onChangeText={(value) => { setTerm(value); setOffset(0); }} />
        <Select label={t.status} locale={locale} value={status}
          options={[{ value: "", label: t.all }, ...(view === "orders" ? statuses : ticketStatuses).map((value) => ({ value, label: statusLabel(value) }))]}
          onChange={(value) => { setStatus(value); setOffset(0); }} />
        {view === "attendees" ? <Select label={t.type} locale={locale} value={type}
          options={[{ value: "", label: t.all }, ...(types.data?.items ?? []).map((value) => ({ value: value.id, label: value.name }))]}
          onChange={(value) => { setType(value); setOffset(0); }} /> : null}
        <Action title={t.export} busy={exporting} disabled={exporting || Boolean(event.error)} onPress={() => void exportRows()} />
      </> : null}
      {view === "orders" ? <Read resource={orders} locale={locale}>{(items) => {
        const all = filterOrders(items, term, status);
        const page = { items: all.slice(offset, offset + 20), total: all.length, offset, limit: 20 };
        return <>
          {page.items.length ? page.items.map((item) => orderCard(item)) : <Muted>{t.empty}</Muted>}
          <PageNav page={page} locale={locale} change={setOffset} />
        </>;
      }}</Read> : null}
      {view === "attendees" ? <Read resource={attendees} locale={locale}>{(page) => <>
        {page.items.length ? page.items.map((item) => <Card key={item.id}>
          <Heading>{item.full_name}</Heading><Muted>{item.email}</Muted>
          <Body>{item.ticket_type}</Body><Pill label={statusLabel(item.ticket_status)} />
          <Action title={t.details} onPress={() => open(organizerEvent(id, `orders/${encodeURIComponent(item.order_id)}`))} />
        </Card>) : <Muted>{t.empty}</Muted>}
        <PageNav page={page} locale={locale} change={setOffset} />
      </>}</Read> : null}
      {view === "refunds" ? <Read resource={refunds} locale={locale}>{(page) => <>
        {page.items.length ? page.items.map((item) => <Card key={item.id}>
          <Pill label={statusLabel(item.status)} /><Body>{formatPrice(item.amount, locale, item.currency)}</Body>
          <Muted>{item.reason}</Muted>
          <Action title={t.details} onPress={() => open(organizerEvent(id, `orders/${encodeURIComponent(item.order_id)}`))} />
        </Card>) : <Muted>{t.empty}</Muted>}
        <PageNav page={page} locale={locale} change={setOffset} />
      </>}</Read> : null}
      {event.data?.status === "published" && orders.data ?
        <Action title={t.cancelEvent} disabled={busy || Boolean(recovery)} onPress={() => ask("event", id)} /> : null}
    </>}
    <Sheet visible={Boolean(selected)} onClose={() => { if (!busy) setSelected(null); }}>
      <Heading>{selected?.kind === "event" ? t.cancelEvent : selected?.kind === "refund" ? t.refund : t.cancel}</Heading>
      <Muted>{selected?.kind === "event" ? t.eventConsequences : t.consequences}</Muted>
      {selected?.kind === "refund" ? <AuthField label={t.reason} value={reason} onChangeText={setReason} maxLength={500} multiline editable={!busy} /> : null}
      <Action title={t.confirm} variant="primary" busy={busy} disabled={busy || (selected?.kind === "refund" && !reason.trim())}
        onPress={() => void commit()} />
      <Action title={t.dismiss} disabled={busy} onPress={() => setSelected(null)} />
    </Sheet>
    {discard}
  </Screen>;
}
