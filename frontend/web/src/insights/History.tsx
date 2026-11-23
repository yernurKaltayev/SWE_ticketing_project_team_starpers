import { useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field } from "../auth/ui";
import { parseEvent } from "../events/contracts";
import { useLiveQuery } from "../support/data";
import { dateQuery, parseHistory, categories } from "./model";
import { label } from "./copy";
import { DateFields, Failure, Pager } from "./ui";
export default function History({
  locale
}: {
  locale: Locale;
}) {
  const {
      eventId = ""
    } = useParams(),
    t = (s: string) => label(locale, s);
  const root = `/api/v1/events/${encodeURIComponent(eventId)}`;
  const event = useLiveQuery(root, parseEvent, 30000);
  const [params, setParams] = useSearchParams(),
    [invalid, setInvalid] = useState(false);
  const filter = useMemo(() => {
    if (!event.data) return {};
    try {
      const q = dateQuery(params, event.data.timezone),
        c = params.get("category"),
        action = params.get("action_type");
      if (c) {
        if (!categories.includes(c as typeof categories[number])) throw new Error();
        q.set("category", c);
      }
      if (action) {
        if (action.length > 100) throw new Error();
        q.set("action_type", action);
      }
      const offset = Number(params.get("offset") ?? 0);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) throw new Error();
      q.set("offset", String(offset));
      q.set("limit", "20");
      return {
        query: q.toString(),
        offset
      };
    } catch {
      return {
        error: true
      };
    }
  }, [event.data, params]);
  const history = useLiveQuery(filter.query !== undefined ? `${root}/history?${filter.query}` : "", parseHistory, 30000, !event.isError);
  const data = event.isError || history.isError ? undefined : history.data;
  return <section className="insights">
  <Link to="/organizer/events">
    {t("archive")}
  </Link>
  <h1>
    {t("history")}
  </h1>
  {event.data && <>
    <h2>
      {event.data.title}
    </h2>
  </>}
  <p>
    {t("newest")}
  </p>
  <form className="insights-filters" key={params.toString()} noValidate onSubmit={e => {
      e.preventDefault();
      const p = new URLSearchParams();
      for (const [k, v] of new FormData(e.currentTarget)) {
        if (v) p.set(k, String(v));
      }
      try {
        dateQuery(p, event.data?.timezone ?? "UTC");
        setInvalid(false);
        setParams(p);
      } catch {
        setInvalid(true);
      }
    }}>
    <DateFields locale={locale} params={params} zone={event.data?.timezone ?? "UTC"} />
    <div>
      <label htmlFor="history-category">
        {t("category")}
      </label>
      <select id="history-category" name="category" defaultValue={params.get("category") ?? ""}>
        <option value="">
          {t("all")}
        </option>
        {categories.map(c => <option key={c} value={c}>
          {t(c)}
        </option>)}
      </select>
    </div>
    <Field name="action_type" label={t("exactAction")} maxLength={100} defaultValue={params.get("action_type") ?? ""} />
    <button>
      {t("apply")}
    </button>
    <button type="button" className="secondary" onClick={() => {
        setParams({});
        setInvalid(false);
      }}>
      {t("reset")}
    </button>
  </form>
  {(invalid || filter.error) && <p role="alert">
    {t("invalid")}
  </p>}
  <Failure error={event.error ?? history.error} locale={locale} />
  <button className="secondary" disabled={history.isFetching} onClick={() => {
      void event.refetch();
      if (filter.query !== undefined && !event.isError) void history.refetch();
    }}>
    {t("refresh")}
  </button>
  {history.isPending && !filter.error && <p>
    {t("loading")}
  </p>}
  {data && <>
    <p>
      {t(data.lifecycle)}
       ·
      {t(data.event_status)}
    </p>
    {!data.items.length && <p>
      {t("empty")}
    </p>}
    <ol className="insights-timeline">
      {data.items.map(row => <li className="insights-card" key={row.id}>
        <time dateTime={row.occurred_at}>
          {formatEventDateTime(row.occurred_at, event.data?.timezone ?? "UTC", locale)}
        </time>
        <h3>
          {row.action_type}
        </h3>
        <p>
          {t("actor_id")}
          :
          {row.actor_id ?? t("none")}
           ·
          {t(row.actor_role)}
        </p>
        <p>
          {t("entity_type")}
          :
          {row.entity_type}
           ·
          {t("entity_id")}
          :
          {row.entity_id}
        </p>
        <p>
          {row.description}
        </p>
      </li>)}
    </ol>
    <Pager locale={locale} offset={filter.offset ?? 0} total={data.total} onChange={n => {
        const p = new URLSearchParams(params);
        p.set("offset", String(n));
        setParams(p);
      }} />
  </>}
</section>;
}
