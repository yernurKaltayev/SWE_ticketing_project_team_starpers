import { useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { parseEvent } from "../events/contracts";
import { useLiveQuery } from "../support/data";
import { useCampaignTypes } from "../promotions/data";
import { parseCampaign, parseReport } from "../promotions/model";
import { analyticsQuery, parseAnalytics } from "./model";
import { useOwnedEvents } from "./data";
import { label } from "./copy";
import { DateFields, EventLinks, Failure } from "./ui";
export default function Analytics({
  locale
}: {
  locale: Locale;
}) {
  const {
    eventId = ""
  } = useParams();
  return <Content key={eventId} id={eventId} locale={locale} />;
}
function Content({
  id,
  locale
}: {
  id: string;
  locale: Locale;
}) {
  const {
      user
    } = useSession(),
    t = (s: string) => label(locale, s);
  const navigate = useNavigate();
  const root = `/api/v1/events/${encodeURIComponent(id)}`;
  const event = useLiveQuery(root, parseEvent, 30000);
  const types = useCampaignTypes(`${root}/ticket-types`);
  const owned = useOwnedEvents();
  const [params, setParams] = useSearchParams();
  const [invalid, setInvalid] = useState(false);
  const filter = useMemo(() => {
    if (!event.data) return {};
    try {
      return {
        query: analyticsQuery(params, event.data.timezone).toString()
      };
    } catch {
      return {
        error: true
      };
    }
  }, [params, event.data]);
  const report = useLiveQuery(filter.query !== undefined ? `${root}/analytics?${filter.query}` : "", parseAnalytics, 30000, !event.isError);
  const data = report.isError || event.isError ? undefined : report.data;
  return <section className="insights">
  <Link to="/organizer/events">
    {t("archive")}
  </Link>
  <h1>
    {t("analytics")}
  </h1>
  {event.data && <>
    <h2>
      {event.data.title}
    </h2>
    <EventLinks id={id} locale={locale} />
  </>}
  <p className="notice">
    {t("demo")}
  </p>
  {user?.role === "organizer" && owned.data && !owned.isError && <div>
    <label htmlFor="analytics-event">
      {t("chooseEvent")}
    </label>
    <select id="analytics-event" value={id} onChange={e => navigate(`/organizer/events/${encodeURIComponent(e.target.value)}/analytics`)}>
      {owned.data.map(e => <option value={e.id} key={e.id}>
        {e.title}
      </option>)}
    </select>
  </div>}
  <form className="insights-filters" key={params.toString()} noValidate onSubmit={e => {
      e.preventDefault();
      const p = new URLSearchParams();
      const f = new FormData(e.currentTarget);
      for (const key of ["date_from", "date_to", "ticket_type_id"]) {
        const v = String(f.get(key) ?? "");
        if (v) p.set(key, v);
      }
      try {
        analyticsQuery(p, event.data?.timezone ?? "UTC");
        setInvalid(false);
        setParams(p);
      } catch {
        setInvalid(true);
      }
    }}>
    <DateFields locale={locale} params={params} zone={event.data?.timezone ?? "UTC"} />
    <div>
      <label htmlFor="analytics-type">
        {t("ticketType")}
      </label>
      <select id="analytics-type" name="ticket_type_id" defaultValue={params.get("ticket_type_id") ?? ""}>
        <option value="">
          {t("allTypes")}
        </option>
        {types.data?.items.map(c => <option key={c.id} value={c.id}>
          {c.name}
        </option>)}
      </select>
    </div>
    <button>
      {t("apply")}
    </button>
    <button className="secondary" type="button" onClick={() => {
        setParams({});
        setInvalid(false);
      }}>
      {t("reset")}
    </button>
  </form>
  {(invalid || filter.error) && <p role="alert">
    {t("invalid")}
  </p>}
  <Failure error={event.error ?? report.error ?? types.error} locale={locale} />
  <button className="secondary" disabled={report.isFetching} onClick={() => {
      void event.refetch();
      if (filter.query !== undefined && !event.isError) void report.refetch();
      types.reload();
    }}>
    {t("refresh")}
  </button>
  {report.isPending && !filter.error && <p role="status">
    {t("loading")}
  </p>}
  {data && <>
    <section id="attendance">
      <h2>
        {t("current")}
      </h2>
      <p>
        {t("inventoryHint")}
      </p>
      <dl className="insights-grid">
        {(["capacity", "sold", "remaining", "percent_sold", "checked_in", "absent", "checkin_percent"] as const).map(k => <div className="insights-metric" key={k}>
          <dt>
            {t(k)}
          </dt>
          <dd>
            {data[k]}
            {k.includes("percent") ? "%" : ""}
          </dd>
        </div>)}
      </dl>
    </section>
    <section>
      <h2>
        {t("money")}
      </h2>
      <p>
        {t("netHint")}
      </p>
      <dl className="insights-grid">
        {(["gross", "discounts", "refunds", "net"] as const).map(k => <div className="insights-metric" key={k}>
          <dt>
            {t(k)}
          </dt>
          <dd>
            {formatMoney(data[k], locale)}
          </dd>
        </div>)}
      </dl>
    </section>
    <section className="insights-card">
      <h2>
        {t("sales")}
      </h2>
      <p>
        {t("seriesHint")}
      </p>
      <Bars values={data.sales_over_time.map(v => v.tickets)} title={t("sales")} />
      <div className="table-scroll">
        <table>
          <caption>
            {t("sales")}
          </caption>
          <thead>
            <tr>
              {["date", "tickets", "revenue"].map(k => <th key={k} scope="col">
                {t(k)}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {data.sales_over_time.map(r => <tr key={r.date}>
              <th scope="row">
                {r.date}
              </th>
              <td>
                {r.tickets}
              </td>
              <td>
                {formatMoney(r.revenue, locale)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
      {!data.sales_over_time.length && <p>
        {t("empty")}
      </p>}
    </section>
    <section className="insights-card">
      <h2>
        {t("comparison")}
      </h2>
      <Bars values={data.by_ticket_type.map(v => v.sold)} title={t("comparison")} />
      <div className="table-scroll">
        <table>
          <caption>
            {t("comparison")}
          </caption>
          <thead>
            <tr>
              {["ticketType", "sold", "revenue"].map(k => <th scope="col" key={k}>
                {t(k)}
              </th>)}
            </tr>
          </thead>
          <tbody>
            {data.by_ticket_type.map(r => <tr key={r.ticket_type_id}>
              <th scope="row">
                {r.name}
              </th>
              <td>
                {r.sold}
              </td>
              <td>
                {formatMoney(r.revenue, locale)}
              </td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </section>
    <section>
      <h2>
        {t("campaigns")}
      </h2>
      {!data.campaigns.length && <p>
        {t("empty")}
      </p>}
      {data.campaigns.map(c => <Campaign key={c.campaign_id} value={c} locale={locale} />)}
    </section>
  </>}
</section>;
}
function Bars({
  values,
  title
}: {
  values: number[];
  title: string;
}) {
  if (!values.length) return null;
  const max = Math.max(1, ...values),
    w = 600 / values.length;
  return <svg className="insights-chart" role="img" aria-label={`${title} — ${values.join(", ")}`} viewBox="0 0 600 180" preserveAspectRatio="none">
  {values.map((v, i) => <rect key={i} x={i * w + 1} y={170 - v / max * 160} width={Math.max(.2, w - 2)} height={v / max * 160}>
    <title>{v}</title>
  </rect>)}
</svg>;
}
function Campaign({
  value,
  locale
}: {
  value: {
    campaign_id: string;
    name: string;
    redemptions: number;
    revenue: number;
  };
  locale: Locale;
}) {
  const t = (s: string) => label(locale, s),
    [open, setOpen] = useState(false);
  const campaign = useLiveQuery(`/api/v1/campaigns/${encodeURIComponent(value.campaign_id)}`, parseCampaign, 30000, open);
  const report = useLiveQuery(`/api/v1/campaigns/${encodeURIComponent(value.campaign_id)}/report`, parseReport, 30000, open);
  return <article className="insights-card">
  <h3>
    {value.name}
  </h3>
  <p>
    {t("redemptions")}
    :
    {value.redemptions}
     ·
    {t("revenue")}
    :
    {formatMoney(value.revenue, locale)}
  </p>
  <button className="secondary" aria-expanded={open} onClick={() => setOpen(v => !v)}>
    {t(open ? "close" : "details")}
  </button>
  {open && <>
    <h4>
      {t("lifetime")}
    </h4>
    <Failure error={campaign.error ?? report.error} locale={locale} />
    {!campaign.isError && !report.isError && campaign.data && report.data && <>
      <p>
        {t("code")}
        :
        {campaign.data.code}
      </p>
      <dl className="record-details">
        {(["redemptions", "tickets_sold", "gross_revenue", "discount", "net_revenue"] as const).map(k => <div key={k}>
          <dt>
            {t(k === "redemptions" ? "redemptions_count" : k)}
          </dt>
          <dd>
            {["redemptions", "tickets_sold"].includes(k) ? report.data[k] : formatMoney(report.data[k], locale)}
          </dd>
        </div>)}
      </dl>
    </>}
  </>}
</article>;
}
