import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ApiError, formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { parseEvent, parseTicketTypes } from "../events/contracts";
import { parseOrder } from "../checkout/model";
import { operationsCopy } from "./copy";
import {
  useOperationsQuery,
  useOrderSnapshot,
  useRefreshOperations,
  downloadCsv,
} from "./data";
import {
  canCancel,
  canRefund,
  definiteFailure,
  eventRoot,
  filterOrders,
  impact,
  loadOrders,
  OperationJournal,
  ordersCsv,
  parseAttendees,
  parseRefund,
  parseRefunds,
  resolved,
  safeOffset,
} from "./model";
import type { Action } from "./model";
import { OperationError, Pager, State } from "./ui";
import "./operations.css";
export default function Workspace({ locale }: { locale: Locale }) {
  const { user } = useSession();
  const { eventId = "", orderId = "" } = useParams();
  return (
    <Content
      key={`${user?.id}:${eventId}:${orderId}`}
      locale={locale}
      eventId={eventId}
    />
  );
}
function Content({ locale, eventId }: { locale: Locale; eventId: string }) {
  const t = operationsCopy[locale];
  const { user, controller } = useSession();
  const { orderId } = useParams();
  const [params, setParams] = useSearchParams();
  const view = ["attendees", "refunds"].includes(params.get("view") ?? "")
    ? params.get("view")!
    : "orders";
  const offset = safeOffset(params.get("offset"));
  const q = (params.get("q") ?? "").slice(0, 100);
  const status = params.get("status") ?? "";
  const type = params.get("ticket_type_id") ?? "";
  const root = eventRoot(eventId);
  const event = useOperationsQuery(root, parseEvent);
  const orders = useOrderSnapshot(eventId, loadOrders);
  const ticketTypes = useOperationsQuery(
    `${root}/ticket-types`,
    parseTicketTypes,
    view === "attendees",
  );
  const aParams = new URLSearchParams({ limit: "20", offset: String(offset) });
  if (q) aParams.set("q", q);
  if (status) aParams.set("status", status);
  if (type) aParams.set("ticket_type_id", type);
  const attendees = useOperationsQuery(
    `${root}/attendees?${aParams}`,
    parseAttendees,
    view === "attendees",
  );
  const refunds = useOperationsQuery(
    `${root}/refunds?limit=20&offset=${view === "refunds" ? offset : 0}`,
    parseRefunds,
  );
  const refresh = useRefreshOperations();
  const journal = useMemo(
    () =>
      new OperationJournal(
        {
          getItem: (k) => sessionStorage.getItem(k),
          setItem: (k, v) => sessionStorage.setItem(k, v),
          removeItem: (k) => sessionStorage.removeItem(k),
        },
        user!.id,
        eventId,
      ),
    [user, eventId],
  );
  const [recovery, setRecovery] = useState<Action | null>(() => {
    try {
      return journal.read();
    } catch {
      return null;
    }
  });
  const [action, setAction] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState(false);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [message, setMessage] = useState<
    "done" | "pendingResult" | "failedResult" | "unresolved" | null
  >(null);
  const lock = useRef(false);
  const alive = useRef(true);
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const focusReturn = useRef<HTMLElement | null>(null);
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (action) {
      dialog.current?.showModal();
    } else if (dialog.current?.open) {
      dialog.current.close();
      if (focusReturn.current?.isConnected) focusReturn.current.focus();
      else document.getElementById("main")?.focus();
    }
  }, [action]);
  // Only reads are polled; the current backend completes synchronously, but future
  // pending RefundOut records remain visibly pending. Stop after one minute.
  const pending =
    !!recovery || refunds.data?.items.some((r) => r.status === "pending");
  useEffect(() => {
    if (!pending || polls >= 12 || busy) return;
    const timer = window.setTimeout(() => {
      if (!document.hidden) {
        setPolls((n) => n + 1);
        void refunds.refetch();
      }
    }, 5000);
    return () => clearTimeout(timer);
  }, [pending, polls, busy, refunds]);
  const all = orders.isError ? undefined : orders.data;
  const ev = event.isError ? undefined : event.data;
  const selected = all?.find((o) => o.id === orderId);
  const filtered = all ? filterOrders(all, q, status) : [];
  const counts = all ? impact(all) : null;
  const selectedAction =
    action && action.kind !== "event"
      ? all?.find((o) => o.id === action.target)
      : undefined;
  const ready = !!ev && !!all && !orders.isFetching && !event.isFetching;
  const blocked = busy || !!recovery || !ready;
  function update(values: Record<string, string>) {
    setParams((old) => {
      const next = new URLSearchParams(old);
      for (const [k, v] of Object.entries(values)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      return next;
    });
  }
  function open(next: Action) {
    focusReturn.current = document.activeElement as HTMLElement;
    setError(null);
    setMessage(null);
    setReason("");
    setReasonError(false);
    setAction(next);
  }
  function close() {
    if (busy) return;
    setAction(null);
  }
  async function check() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const existing = journal.read();
      if (!existing) {
        setRecovery(null);
        await refresh();
        return;
      }
      const [current, list, raw] = await Promise.all([
        controller.request(root).then(parseEvent),
        loadOrders(controller.request, eventId),
        controller.request(`${root}/refunds?limit=100&offset=0`),
      ]);
      // A targeted refund may be outside page one. Read all pages before treating a
      // failed/completed refund as resolved. A matching refunded order also suffices.
      let page = parseRefunds(raw);
      const rows = [...page.items];
      while (rows.length < page.total) {
        page = parseRefunds(
          await controller.request(
            `${root}/refunds?limit=100&offset=${rows.length}`,
          ),
        );
        if (!page.items.length || rows.length > 10000)
          throw new Error("invalid_page");
        rows.push(...page.items);
      }
      if (resolved(existing, list, rows, current.status)) {
        journal.clear();
        setRecovery(null);
        setMessage(
          rows.some(
            (r) =>
              r.id === existing.refundId &&
              r.order_id === existing.target &&
              r.status === "failed" &&
              !list.some(
                (o) => o.id === existing.target && o.status === "refunded",
              ),
          )
            ? "failedResult"
            : "done",
        );
      } else setMessage("unresolved");
      await refresh();
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function submit() {
    if (!action || lock.current || !all || !ev) return;
    if (
      action.kind === "refund" &&
      (!reason.trim() || reason.trim().length > 500)
    ) {
      setReasonError(true);
      reasonRef.current?.focus();
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(null);
    setMessage(null);
    let sent = false;
    try {
      if (action.kind === "event") {
        const [fresh, list] = await Promise.all([
          controller.request(root).then(parseEvent),
          loadOrders(controller.request, eventId),
        ]);
        if (
          fresh.status !== ev.status ||
          JSON.stringify(impact(list)) !== JSON.stringify(counts)
        )
          throw new ApiError(
            409,
            "snapshot_changed",
            "Review current event impact.",
          );
      } else {
        const fresh = parseOrder(
          await controller.request(
            `/api/v1/orders/${encodeURIComponent(action.target)}`,
          ),
        );
        if (
          !selectedAction ||
          fresh.id !== selectedAction.id ||
          fresh.total !== selectedAction.total ||
          fresh.status !== selectedAction.status ||
          !(action.kind === "refund" ? canRefund(fresh) : canCancel(fresh))
        )
          throw new ApiError(409, "snapshot_changed", "Order changed.");
      }
      journal.begin(action);
      setRecovery(action);
      sent = true;
      const path =
        action.kind === "event"
          ? `${root}/cancel`
          : `/api/v1/orders/${encodeURIComponent(action.target)}/${action.kind}`;
      const raw = await controller.request(path, {
        method: "POST",
        ...(action.kind === "refund"
          ? { body: { reason: reason.trim() } }
          : {}),
      });
      let result: "done" | "pendingResult" | "failedResult" = "done";
      if (action.kind === "refund") {
        const refund = parseRefund(raw);
        if (refund.order_id !== action.target) throw new Error("wrong_order");
        if (refund.status === "pending") {
          const waiting = { ...action, refundId: refund.id };
          journal.retain(waiting);
          setRecovery(waiting);
        }
        result =
          refund.status === "pending"
            ? "pendingResult"
            : refund.status === "failed"
              ? "failedResult"
              : "done";
      } else if (action.kind === "event") {
        const cancelled = parseEvent(raw);
        if (cancelled.id !== eventId || cancelled.status !== "cancelled")
          throw new Error("unconfirmed_event");
      } else {
        const cancelled = parseOrder(raw);
        if (cancelled.id !== action.target || cancelled.status !== "cancelled")
          throw new Error("unconfirmed_order");
      }
      if (result !== "pendingResult") {
        journal.clear();
        setRecovery(null);
      }
      if (alive.current) {
        setMessage(result);
        setAction(null);
      }
    } catch (e) {
      if (sent && definiteFailure(e)) {
        journal.clear();
        setRecovery(null);
      }
      if (alive.current) setError(e);
    } finally {
      await refresh();
      lock.current = false;
      if (alive.current) setBusy(false);
    }
  }
  async function exportRows() {
    if (exporting) return;
    setExporting(true);
    setError(null);
    try {
      let blob: Blob;
      if (view === "attendees") {
        const filters = new URLSearchParams(aParams);
        filters.delete("limit");
        filters.delete("offset");
        blob = await controller.request(`${root}/attendees.csv?${filters}`, {
          responseType: "blob",
          headers: { Accept: "text/csv" },
        });
      } else {
        const fresh = await loadOrders(controller.request, eventId);
        blob = new Blob([ordersCsv(filterOrders(fresh, q, status))], {
          type: "text/csv;charset=utf-8",
        });
      }
      if (alive.current) downloadCsv(blob, `${view}-${eventId}.csv`);
    } catch (e) {
      if (alive.current) setError(e);
    } finally {
      if (alive.current) setExporting(false);
    }
  }
  return (
    <section className="operations">
      <Link to={`/organizer/events/${encodeURIComponent(eventId)}/edit`}>
        {t.back}
      </Link>
      <h1>{t.title}</h1>
      {ev && <h2>{ev.title}</h2>}
      <p>{t.readonly}</p>
      {ev?.status === "cancelled" && <p role="status">{t.cancelled}</p>}
      <OperationError
        error={error || event.error || orders.error}
        t={t}
        retry={() => void refresh()}
      />
      {message && (
        <p role="status" className="notice">
          {t[message]}
        </p>
      )}
      {recovery && !busy && (
        <div role="alert" className="notice">
          <p>{t.unknown}</p>
          <p>{recovery.target}</p>
          <button onClick={() => void check()}>{t.check}</button>
        </div>
      )}
      {(event.isPending || orders.isPending) && (
        <p role="status">{t.loading}</p>
      )}
      {ev && all && (
        <>
          <nav className="controls" aria-label={t.title}>
            {(["orders", "attendees", "refunds"] as const).map((v) => (
              <Link
                key={v}
                aria-current={view === v ? "page" : undefined}
                to={`?view=${v}`}
              >
                {t[v]}
              </Link>
            ))}
          </nav>
          <div className="controls">
            <button disabled={busy} onClick={() => void refresh()}>
              {t.refresh}
            </button>
            {view !== "refunds" && (
              <button
                disabled={exporting || !ready}
                onClick={() => void exportRows()}
              >
                {exporting ? t.working : t.export}
              </button>
            )}
            {!["cancelled", "completed"].includes(ev.status) && (
              <button
                disabled={blocked}
                onClick={() => open({ kind: "event", target: eventId })}
              >
                {t.cancelEvent}
              </button>
            )}
          </div>
          {view !== "refunds" && (
            <>
              <p>{view === "orders" ? t.snapshot : t.exportHint}</p>
              <form
                key={`${view}:${q}:${status}:${type}`}
                className="operation-filters"
                onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.currentTarget);
                  update({
                    q: String(f.get("q") ?? "").trim(),
                    status: String(f.get("status") ?? ""),
                    ticket_type_id: String(f.get("ticket_type_id") ?? ""),
                    offset: "0",
                  });
                }}
              >
                <label>
                  {t.search}
                  <input name="q" defaultValue={q} maxLength={100} />
                </label>
                <div className="field">
                  <label htmlFor="f6-status">{t.status}</label>
                  <select id="f6-status" name="status" defaultValue={status}>
                    <option value="">{t.all}</option>
                    {(view === "attendees"
                      ? [
                          "pending",
                          "valid",
                          "checked_in",
                          "cancelled",
                          "refunded",
                        ]
                      : [
                          "pending",
                          "free_confirmed",
                          "paid",
                          "cancelled",
                          "refunded",
                          "expired",
                          "failed",
                        ]
                    ).map((s) => (
                      <option key={s} value={s}>
                        {t.state[s as keyof typeof t.state]}
                      </option>
                    ))}
                  </select>
                </div>
                {view === "attendees" && (
                  <div className="field">
                    <label htmlFor="f6-ticket-type">{t.type}</label>
                    <select
                      id="f6-ticket-type"
                      name="ticket_type_id"
                      defaultValue={type}
                    >
                      <option value="">{t.all}</option>
                      {ticketTypes.data?.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <button>{t.apply}</button>
                <button
                  type="button"
                  className="secondary"
                  onClick={() =>
                    update({
                      q: "",
                      status: "",
                      ticket_type_id: "",
                      offset: "0",
                    })
                  }
                >
                  {t.clear}
                </button>
              </form>
            </>
          )}
          {orderId && (
            <>
              {selected ? (
                <div>
                  <h2>
                    {t.details}: {selected.order_number}
                  </h2>
                  <State value={selected.status} t={t} />
                  <p>
                    {t.total}:{" "}
                    {formatMoney(selected.total, locale, selected.currency)}
                  </p>
                  {selected.is_simulated && (
                    <p className="notice">{t.simulated}</p>
                  )}
                  <ul>
                    {selected.tickets.map((ticket) => (
                      <li key={ticket.id}>
                        {ticket.ticket_number} · {ticket.attendee_name} ·{" "}
                        {ticket.ticket_type}{" "}
                        <State value={ticket.status} t={t} />
                      </li>
                    ))}
                  </ul>
                  <div className="controls">
                    {canCancel(selected) && (
                      <button
                        disabled={blocked}
                        onClick={() =>
                          open({ kind: "cancel", target: selected.id })
                        }
                      >
                        {t.cancel}
                      </button>
                    )}
                    {canRefund(selected) && (
                      <button
                        disabled={blocked}
                        onClick={() =>
                          open({ kind: "refund", target: selected.id })
                        }
                      >
                        {t.refund}
                      </button>
                    )}
                    {!canCancel(selected) && !canRefund(selected) && (
                      <p>{t.noAction}</p>
                    )}
                  </div>
                </div>
              ) : (
                <p role="alert">{t.denied}</p>
              )}
            </>
          )}
          {view === "orders" && (
            <>
              <div className="table-scroll">
                <table>
                  <caption>{t.orders}</caption>
                  <thead>
                    <tr>
                      <th>{t.identity}</th>
                      <th>{t.status}</th>
                      <th>{t.total}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(offset, offset + 20).map((o) => (
                      <tr key={o.id}>
                        <td>
                          <Link
                            to={`/organizer/events/${encodeURIComponent(eventId)}/orders/${encodeURIComponent(o.id)}`}
                          >
                            {o.order_number}
                          </Link>
                          {o.is_simulated && <span> · {t.simulated}</span>}
                        </td>
                        <td>
                          <State value={o.status} t={t} />
                        </td>
                        <td>{formatMoney(o.total, locale, o.currency)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!filtered.length && <p>{t.empty}</p>}
              <Pager
                offset={offset}
                total={filtered.length}
                change={(n) => update({ offset: String(n) })}
                t={t}
              />
            </>
          )}
          {view === "attendees" && (
            <>
              <OperationError
                error={attendees.error || ticketTypes.error}
                t={t}
                retry={() => void refresh()}
              />
              {attendees.isPending && <p>{t.loading}</p>}
              {attendees.data && !attendees.isError && (
                <>
                  <div className="table-scroll">
                    <table>
                      <caption>{t.attendees}</caption>
                      <thead>
                        <tr>
                          {[t.name, t.email, t.type, t.status, t.identity].map(
                            (x) => (
                              <th key={x}>{x}</th>
                            ),
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {attendees.data.items.map((a) => (
                          <tr key={a.id}>
                            <td>{a.full_name}</td>
                            <td>{a.email}</td>
                            <td>{a.ticket_type}</td>
                            <td>
                              <State value={a.ticket_status} t={t} />
                            </td>
                            <td>
                              <Link
                                to={`/organizer/events/${encodeURIComponent(eventId)}/orders/${encodeURIComponent(a.order_id)}`}
                              >
                                {a.order_id}
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!attendees.data.items.length && <p>{t.empty}</p>}
                  <Pager
                    offset={offset}
                    total={attendees.data.total}
                    change={(n) => update({ offset: String(n) })}
                    t={t}
                  />
                </>
              )}
            </>
          )}
          {view === "refunds" && (
            <>
              <OperationError
                error={refunds.error}
                t={t}
                retry={() => void refresh()}
              />
              {refunds.isPending && <p>{t.loading}</p>}
              {refunds.data && !refunds.isError && (
                <>
                  <div className="table-scroll">
                    <table>
                      <caption>{t.refunds}</caption>
                      <thead>
                        <tr>
                          <th>{t.identity}</th>
                          <th>{t.status}</th>
                          <th>{t.amount}</th>
                          <th>{t.reason}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {refunds.data.items.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <Link
                                to={`/organizer/events/${encodeURIComponent(eventId)}/orders/${encodeURIComponent(r.order_id)}`}
                              >
                                {r.order_id}
                              </Link>
                            </td>
                            <td>
                              <State value={r.status} t={t} />
                            </td>
                            <td>{formatMoney(r.amount, locale, r.currency)}</td>
                            <td>{r.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {!refunds.data.items.length && <p>{t.empty}</p>}
                  <Pager
                    offset={offset}
                    total={refunds.data.total}
                    change={(n) => update({ offset: String(n) })}
                    t={t}
                  />
                </>
              )}
            </>
          )}
        </>
      )}
      <dialog
        ref={dialog}
        aria-labelledby="f6-confirm-title"
        aria-describedby="f6-consequences"
        onCancel={(e) => {
          e.preventDefault();
          close();
        }}
        onClose={() => {
          if (!busy) setAction(null);
        }}
      >
        <h2 id="f6-confirm-title">
          {action?.kind === "event"
            ? t.cancelEvent
            : action?.kind === "refund"
              ? t.refund
              : t.cancel}
        </h2>
        <p id="f6-consequences">
          {action?.kind === "event" ? t.eventConsequences : t.consequences}
        </p>
        {action?.kind === "event" && counts ? (
          <dl>
            {[
              [t.free, counts.free],
              [t.paid, counts.paid],
              [t.pending, counts.pending],
              [t.paidTotal, formatMoney(counts.amount, locale)],
            ].map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          selectedAction && (
            <>
              <p>
                {t.identity}: {selectedAction.order_number} ·{" "}
                {selectedAction.id}
              </p>
              <p>
                {t.amount}:{" "}
                {formatMoney(
                  selectedAction.total,
                  locale,
                  selectedAction.currency,
                )}
              </p>
              <p>
                {t.quantity}:{" "}
                {selectedAction.items.reduce((n, i) => n + i.quantity, 0)}
              </p>
              {selectedAction.is_simulated && <p>{t.simulated}</p>}
            </>
          )
        )}
        {action?.kind === "refund" && (
          <label>
            {t.reason}
            <textarea
              ref={reasonRef}
              aria-label={t.reason}
              maxLength={500}
              value={reason}
              disabled={busy}
              aria-invalid={reasonError}
              aria-describedby={reasonError ? "f6-reason-error" : undefined}
              onChange={(e) => {
                setReason(e.target.value);
                setReasonError(false);
              }}
            />
            {reasonError && (
              <span id="f6-reason-error">{t.reasonRequired}</span>
            )}
          </label>
        )}
        <OperationError error={error} t={t} />
        <div className="controls">
          <button
            autoFocus
            disabled={busy}
            className="secondary"
            onClick={close}
          >
            {t.dismiss}
          </button>
          <button
            disabled={
              busy ||
              !!recovery ||
              !ready ||
              (action?.kind !== "event" && !selectedAction)
            }
            onClick={() => void submit()}
          >
            {busy ? t.working : t.confirm}
          </button>
        </div>
      </dialog>
    </section>
  );
}
