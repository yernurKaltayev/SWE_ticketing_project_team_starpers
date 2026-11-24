import { useQuery } from "@tanstack/react-query";
import { retryRead, readDelay, useVisible } from "../support/data";
import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { Field } from "../auth/ui";
import { useLiveQuery } from "../support/data";
import { priceInput } from "../events/model";
import { downloadCsv } from "../operations/data";
import { adminFields, adminPath, adminQuery, adminStatuses, hasDates, hasSearch, parseAdminPage, parseRow, parseDisputes, parseSettings, settingsBody, sections, exportKinds, exportPath } from "./model";
import type { AdminSection, Row, Settings } from "./model";
import { useWriteScope } from "./data";
import { label } from "./copy";
import { Confirm, DateFields, Failure, Pager, RecordDetails, Value } from "./ui";
const columns: Record<AdminSection, string[]> = {
  users: ["full_name", "email", "role", "is_suspended"],
  events: ["title", "status", "paid_sales_status", "starts_at"],
  orders: ["order_number", "buyer_email", "status", "total", "is_simulated"],
  payments: ["provider_ref", "kind", "status", "amount", "is_simulated"],
  activations: ["event_id", "status", "identity_verified", "suspended_reason"],
  refunds: ["order_id", "status", "amount", "reason"],
  support: ["subject", "category", "status", "assignee_id"],
  campaigns: ["name", "redemptions_count", "applied_redemptions", "discount_total"],
  reports: ["event_id", "reason", "status", "created_at"]
};
export default function Admin({
  locale
}: {
  locale: Locale;
}) {
  const {
      section = "users"
    } = useParams(),
    {
      user
    } = useSession(),
    t = (s: string) => label(locale, s);
  if (user?.role !== "platform_admin") return <p role="alert">
  {t("denied")}
</p>;
  const valid = [...sections, "disputes", "settings", "exports"].includes(section);
  return <section className="insights">
  <h1>
    {t("admin")}
  </h1>
  <nav className="insights-nav" aria-label={t("admin")}>
    {[...sections, "disputes", "settings", "exports"].map(s => <Link key={s} to={`/admin/${s}`} aria-current={s === section ? "page" : undefined}>
      {t(s)}
    </Link>)}
  </nav>
  <p className="notice">
    {t("demo")}
  </p>
  {!valid ? <p>
    {t("empty")}
  </p> : section === "settings" ? <SettingsPage locale={locale} /> : section === "exports" ? <Exports locale={locale} /> : section === "disputes" ? <Disputes locale={locale} /> : <Search key={`${user.id}:${section}`} locale={locale} section={section as AdminSection} />}
</section>;
}
function Search({
  section,
  locale
}: {
  section: AdminSection;
  locale: Locale;
}) {
  const t = (s: string) => label(locale, s),
    [params, setParams] = useSearchParams(),
    [invalid, setInvalid] = useState(false),
    [selected, setSelected] = useState<string | null>(null);
  const filter = useMemo(() => {
    try {
      return {
        query: adminQuery(section, params).toString()
      };
    } catch {
      return {
        error: true
      };
    }
  }, [section, params]);
  const parse = useMemo(() => parseAdminPage(section), [section]);
  const query = useLiveQuery(filter.query ? `${adminPath(section)}?${filter.query}` : "", parse, 30000);
  const data = query.isError ? undefined : query.data;
  const row = data?.items.find(r => String(r.id ?? r.campaign_id) === selected);
  const write = useWriteScope(`admin:${section}`),
    [checked, setChecked] = useState(false);
  type Action = {
    path: string;
    body: Record<string, unknown>;
    title: string;
    hint: string;
    parse: (v: unknown) => Row;
    reason?: boolean;
  };
  const [action, setAction] = useState<Action | null>(null),
    [reason, setReason] = useState("");
  const offset = Number(new URLSearchParams(filter.query).get("offset") ?? 0);
  function suspend(r: Row, sales = false) {
    const id = String(r.id);
    const suspended = sales ? r.paid_sales_status !== "suspended" : section === "users" ? !r.is_suspended : r.status !== "suspended";
    setReason("");
    setAction({
      path: `/api/v1/admin/${section}/${encodeURIComponent(id)}/${sales ? "paid-sales/suspend" : "suspend"}`,
      body: {
        suspended
      },
      reason: true,
      title: `${t(sales ? suspended ? "suspendSales" : "resumeSales" : suspended ? "suspend" : "reinstate")} · ${String(r.title ?? r.full_name ?? id)}`,
      hint: section === "users" ? "userSuspendHint" : sales ? "salesHint" : "suspensionHint",
      parse: v => {
        const result = parseRow(sales ? "activations" : section, v);
        if (result[sales ? "event_id" : "id"] !== id) throw new Error("response_target");
        return result;
      }
    });
  }
  async function refresh() {
    if (!filter.query) return;
    const r = await query.refetch();
    setChecked(!r.isError);
    setSelected(null);
  }
  return <>
  <h2>
    {t(section)}
  </h2>
  <form key={params.toString()} className="insights-filters" noValidate onSubmit={e => {
      e.preventDefault();
      const p = new URLSearchParams();
      for (const [k, v] of new FormData(e.currentTarget)) {
        if (String(v).trim()) p.set(k, String(v).trim());
      }
      try {
        adminQuery(section, p);
        setInvalid(false);
        setSelected(null);
        setParams(p);
      } catch {
        setInvalid(true);
      }
    }}>
    {hasSearch(section) && <Field name="q" label={t("search")} maxLength={200} defaultValue={params.get("q") ?? ""} />}
    {adminStatuses[section] && <div>
      <label htmlFor="admin-status">
        {t("status")}
      </label>
      <select id="admin-status" name="status" defaultValue={params.get("status") ?? ""}>
        <option value="">
          {t("all")}
        </option>
        {adminStatuses[section]!.map(s => <option key={s} value={s}>
          {t(s)}
        </option>)}
      </select>
    </div>}
    {section === "users" && <>
      <div>
        <label htmlFor="admin-role">
          {t("role")}
        </label>
        <select id="admin-role" name="role" defaultValue={params.get("role") ?? ""}>
          <option value="">
            {t("all")}
          </option>
          {["attendee", "organizer", "platform_admin"].map(v => <option key={v} value={v}>
            {t(v)}
          </option>)}
        </select>
      </div>
      <div>
        <label htmlFor="admin-suspended">
          {t("is_suspended")}
        </label>
        <select id="admin-suspended" name="suspended" defaultValue={params.get("suspended") ?? ""}>
          <option value="">
            {t("all")}
          </option>
          <option value="true">
            {t("yes")}
          </option>
          <option value="false">
            {t("no")}
          </option>
        </select>
      </div>
    </>}
    {section === "orders" && <Field name="event_id" label={t("event_id")} defaultValue={params.get("event_id") ?? ""} />}
    {hasDates(section) && <DateFields locale={locale} params={params} keys={["created_from", "created_to"]} zone="UTC" />}
    <button>
      {t("apply")}
    </button>
    <button type="button" className="secondary" onClick={() => {
        setParams({});
        setInvalid(false);
        setSelected(null);
      }}>
      {t("reset")}
    </button>
  </form>
  {(invalid || filter.error) && <p role="alert">
    {t("invalid")}
  </p>}
  <Failure error={query.error ?? write.error} locale={locale} />
  <button className="secondary" disabled={query.isFetching || write.busy} onClick={() => void refresh()}>
    {t("refresh")}
  </button>
  {write.saved && <p role="status">
    {t("saved")}
  </p>}
  {write.uncertain && <>
    <p role="alert">
      {t("unknown")}
    </p>
    <button disabled={!checked || query.isFetching} onClick={() => {
        write.acknowledge();
        setChecked(false);
      }}>
      {t("checkedRecords")}
    </button>
  </>}
  {query.isPending && !filter.error && <p>
    {t("loading")}
  </p>}
  {data && <>
    <DataTable section={section} rows={data.items} locale={locale} select={r => setSelected(String(r.id ?? r.campaign_id))} />
    <Pager offset={offset} total={data.total} locale={locale} onChange={n => {
        setSelected(null);
        const p = new URLSearchParams(params);
        p.set("offset", String(n));
        setParams(p);
      }} />
  </>}
  {row && <article className="insights-card">
    <h3>
      {t("details")}
    </h3>
    <p>
      {t("detailHint")}
    </p>
    <RecordDetails row={row} fields={adminFields(section)} locale={locale} />
    <div className="controls">
      <button className="secondary" onClick={() => setSelected(null)}>
        {t("close")}
      </button>
      {section === "users" && row.role !== "platform_admin" && <button disabled={write.busy || write.uncertain} onClick={() => suspend(row)}>
        {t(row.is_suspended ? "reinstate" : "suspend")}
      </button>}
      {section === "events" && <>
        {["published", "suspended"].includes(String(row.status)) && <button disabled={write.busy || write.uncertain} onClick={() => suspend(row)}>
          {t(row.status === "suspended" ? "reinstate" : "suspend")}
        </button>}
        {["active", "suspended"].includes(String(row.paid_sales_status)) && <button disabled={write.busy || write.uncertain || row.status === "suspended"} onClick={() => suspend(row, true)}>
          {t(row.paid_sales_status === "suspended" ? "resumeSales" : "suspendSales")}
        </button>}
        <Link to={`/organizer/events/${row.id}/analytics`}>
          {t("analytics")}
        </Link>
        <Link to={`/organizer/events/${row.id}/history`}>
          {t("history")}
        </Link>
      </>}
      {section === "orders" && <Link to={`/admin/orders?event_id=${row.event_id}`}>
        {t("orders")}
      </Link>}
      {section === "support" && <Link to={`/support/cases/${row.id}`}>
        {t("support")}
      </Link>}
      {section === "reports" && <>
        <p>
          {t("moderationHint")}
        </p>
        {["reviewed", "dismissed", "actioned"].filter(s => s !== row.status).map(status => <button key={status} disabled={write.busy || write.uncertain} onClick={() => setAction({
            path: `/api/v1/admin/reports/${row.id}`,
            body: {
              status
            },
            title: t(status),
            hint: "moderationHint",
            parse: v => {
              const result = parseRow("reports", v);
              if (result.id !== row.id) throw new Error("response_target");
              return result;
            }
          })}>
          {t(status)}
        </button>)}
        <Link to="/admin/events">
          {t("events")}
        </Link>
      </>}
    </div>
  </article>}
  {action && row && data && !query.isError && <Confirm title={action.title} locale={locale} busy={write.busy} blocked={write.uncertain} reason={action.reason} reasonValue={reason} onReason={setReason} error={write.error} onClose={() => setAction(null)} onConfirm={() => {
      setChecked(false);
      void write.run(action.path, {
        ...action.body,
        ...(action.reason ? {
          reason: reason.trim()
        } : {})
      }, action.reason ? "POST" : "PATCH", action.parse).then(result => {
        if (result) {
          setAction(null);
          setSelected(null);
          void query.refetch();
        }
      });
    }}>
    <p>
      {t(action.hint)}
    </p>
  </Confirm>}
</>;
}
function DataTable({
  section,
  rows,
  locale,
  select
}: {
  section: AdminSection;
  rows: Row[];
  locale: Locale;
  select?: (r: Row) => void;
}) {
  const t = (s: string) => label(locale, s);
  if (!rows.length) return <p>
  {t("empty")}
</p>;
  return <div className="table-scroll">
  <table>
    <caption>
      {t(section)}
    </caption>
    <thead>
      <tr>
        {columns[section].map(c => <th key={c} scope="col">
          {t(c)}
        </th>)}
        <th scope="col">
          {t("details")}
        </th>
      </tr>
    </thead>
    <tbody>
      {rows.map(r => <tr key={String(r.id ?? r.campaign_id)}>
        {columns[section].map((c, i) => i === 0 ? <th scope="row" key={c}>
          {c === "event_id" && typeof r[c] === "string" ? <EventName id={r[c]} /> : <Cell field={c} value={r[c]} locale={locale} />}
        </th> : <td key={c}>
          <Cell field={c} value={r[c]} locale={locale} />
        </td>)}
        <td>
          {select ? <button className="secondary" onClick={() => select(r)}>
            {t("details")}
          </button> : section === "support" ? <Link to={`/support/cases/${r.id}`}>
            {t("support")}
          </Link> : <Link to="/admin/refunds">
            {t("refunds")}
          </Link>}
        </td>
      </tr>)}
    </tbody>
  </table>
</div>;
}
function Disputes({
  locale
}: {
  locale: Locale;
}) {
  const t = (s: string) => label(locale, s);
  const query = useLiveQuery("/api/v1/admin/disputes?limit=100", parseDisputes, 30000);
  return <>
  <h2>
    {t("disputes")}
  </h2>
  <p>
    {t("disputesHint")}
  </p>
  <Failure error={query.error} locale={locale} />
  <button className="secondary" onClick={() => void query.refetch()}>
    {t("refresh")}
  </button>
  {query.data && !query.isError && <>
    <h3>
      {t("refunds")}
    </h3>
    <DataTable section="refunds" rows={query.data.failed_refunds} locale={locale} />
    <h3>
      {t("support")}
    </h3>
    <DataTable section="support" rows={query.data.payment_cases} locale={locale} />
  </>}
</>;
}
function SettingsPage({
  locale
}: {
  locale: Locale;
}) {
  const t = (s: string) => label(locale, s);
  const {
      user,
      controller
    } = useSession(),
    visible = useVisible();
  const query = useQuery({
    queryKey: ["f10", user?.id, "settings"],
    queryFn: async ({
      signal
    }) => parseSettings(await controller.request("/api/v1/admin/settings", {
      signal
    })),
    enabled: !!user && visible,
    staleTime: Infinity,
    retry: retryRead,
    retryDelay: readDelay,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  const write = useWriteScope("settings"),
    [changes, setChanges] = useState<{
      settings: Partial<Settings>;
    } | null>(null),
    [invalid, setInvalid] = useState(false),
    [checked, setChecked] = useState(false);
  return <>
  <h2>
    {t("settings")}
  </h2>
  <p>
    {t("unitsHint")}
  </p>
  <Failure error={query.error ?? write.error} locale={locale} />
  {invalid && <p role="alert">
    {t("noChanges")}
  </p>}
  {write.saved && <p role="status">
    {t("saved")}
  </p>}
  <button className="secondary" disabled={query.isFetching || write.busy} onClick={() => {
      void query.refetch().then(r => setChecked(!r.isError));
      setChanges(null);
    }}>
    {t("refresh")}
  </button>
  {write.uncertain && <>
    <p role="alert">
      {t("unknown")}
    </p>
    <button disabled={!checked} onClick={() => {
        write.acknowledge();
        setChecked(false);
      }}>
      {t("checkedRecords")}
    </button>
  </>}
  {query.data && !query.isError && <form className="insights-card" key={query.dataUpdatedAt} noValidate onSubmit={e => {
      e.preventDefault();
      try {
        setChanges(settingsBody(new FormData(e.currentTarget), query.data));
        setInvalid(false);
      } catch {
        setInvalid(true);
      }
    }}>
    <fieldset disabled={write.busy || write.uncertain}>
      <Field name="activation_fee_amount" label={t("activation_fee_amount")} inputMode="decimal" defaultValue={priceInput(query.data.activation_fee_amount)} />
      <Field name="processing_fee_percent" label={t("processing_fee_percent")} inputMode="decimal" defaultValue={query.data.processing_fee_percent} />
      <Field name="payout_delay_days" label={t("payout_delay_days")} type="number" min={0} step={1} defaultValue={query.data.payout_delay_days} />
      <Field name="hold_minutes" label={t("hold_minutes")} type="number" min={1} step={1} defaultValue={query.data.hold_minutes} />
      <button>
        {t("save")}
      </button>
    </fieldset>
  </form>}
  {changes && query.data && !query.isError && <Confirm title={t("settings")} locale={locale} busy={write.busy} blocked={write.uncertain} error={write.error} onClose={() => setChanges(null)} onConfirm={() => {
      setChecked(false);
      void write.run("/api/v1/admin/settings", changes, "PATCH", parseSettings).then(result => {
        if (result) {
          setChanges(null);
          void query.refetch();
        }
      });
    }}>
    <dl className="record-details">
      {(Object.keys(changes.settings) as (keyof Settings)[]).map(k => <div key={k}>
        <dt>
          {t(k)}
        </dt>
        <dd>
          {t("before")}


          :


          {k === "activation_fee_amount" ? formatMoney(query.data![k], locale) : query.data![k]}


           →


          {t("after")}


          :


          {k === "activation_fee_amount" ? formatMoney(changes.settings[k]!, locale) : changes.settings[k]}
        </dd>
      </div>)}
    </dl>
  </Confirm>}
</>;
}
function Exports({
  locale
}: {
  locale: Locale;
}) {
  const t = (s: string) => label(locale, s),
    {
      user,
      controller
    } = useSession();
  const [kind, setKind] = useState<string>("orders"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>();
  return <>
  <h2>
    {t("exports")}
  </h2>
  <p>
    {t("exportHint")}
  </p>
  <Failure error={error} locale={locale} />
  <form className="insights-filters" noValidate onSubmit={e => {
      e.preventDefault();
      if (busy) return;
      const params = new URLSearchParams();
      for (const [k, v] of new FormData(e.currentTarget)) if (v) params.set(k, String(v));
      let path;
      try {
        path = exportPath(kind, params);
      } catch {
        setError(new Error("invalid_dates"));
        return;
      }
      setError(undefined);
      setBusy(true);
      const owner = user?.id;
      void controller.request<Blob>(path, {
        responseType: "blob",
        headers: {
          Accept: "text/csv"
        }
      }).then(blob => {
        if (controller.getSnapshot().user?.id === owner) downloadCsv(blob, `${kind}.csv`);
      }).catch(setError).finally(() => setBusy(false));
    }}>
    <div>
      <label htmlFor="export-kind">
        {t("exports")}
      </label>
      <select id="export-kind" disabled={busy} value={kind} onChange={e => setKind(e.target.value)}>
        {exportKinds.map(k => <option key={k} value={k}>
          {t(k)}
        </option>)}
      </select>
    </div>
    <DateFields locale={locale} params={new URLSearchParams()} keys={["created_from", "created_to"]} zone="UTC" />
    <button disabled={busy}>
      {t(busy ? "working" : "export")}
    </button>
  </form>
</>;
}

/** Reports and activations carry only an event ID; show the event's title instead. */
function EventName({
  id
}: {
  id: string;
}) {
  const {
    user,
    controller
  } = useSession();
  const query = useQuery({
    queryKey: ["admin-event-name", user?.id, id],
    queryFn: async ({
      signal
    }) => {
      const raw = await controller.request(`/api/v1/events/${encodeURIComponent(id)}`, {
        signal
      });
      const title = raw && typeof raw === "object" && "title" in raw ? (raw as {
        title: unknown;
      }).title : null;
      return typeof title === "string" ? title : null;
    },
    staleTime: 5 * 60_000,
    retry: false
  });
  return <span title={id}>
    {query.data ?? <span className="commerce-identifier">{id.slice(0, 8)}…</span>}
  </span>;
}

/** Table cells: other records' IDs are shortened; full values stay in the details panel. */
function Cell({
  field,
  value,
  locale
}: {
  field: string;
  value: unknown;
  locale: Locale;
}) {
  if (field.endsWith("_id") && typeof value === "string" && value.length > 12) return <span className="commerce-identifier" title={value}>
    {value.slice(0, 8)}…
  </span>;
  return <Value field={field} value={value} locale={locale} />;
}
