import { DuplicateEvent } from "./DuplicateEvent";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { lifecycle, lifecycles } from "./model";
import { useOwnedEvents } from "./data";
import { label } from "./copy";
import { EventLinks, Failure, Pager } from "./ui";
export default function Archive({
  locale
}: {
  locale: Locale;
}) {
  const t = (s: string) => label(locale, s),
    query = useOwnedEvents();
  const [params, setParams] = useSearchParams();
  const group = lifecycles.includes(params.get("lifecycle") as typeof lifecycles[number]) ? params.get("lifecycle")! : "";
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState !== "hidden") setNow(Date.now());
    };
    const interval = setInterval(update, 30000);
    document.addEventListener("visibilitychange", update);
    window.addEventListener("focus", update);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  const events = query.isError ? [] : query.data ?? [];
  const rows = events.filter(e => !group || lifecycle(e, now) === group);
  const raw = Number(params.get("offset") ?? 0),
    offset = Number.isSafeInteger(raw) && raw >= 0 ? Math.min(raw, Math.max(0, Math.floor((rows.length - 1) / 20) * 20)) : 0;
  const page = rows.slice(offset, offset + 20);
  return <section className="insights">
  <header className="event-heading">
    <h1>
      {t("archive")}
    </h1>
    <Link className="action-link" to="/organizer/events/new">
      {t("newDraft")}
    </Link>
  </header>
  <nav className="insights-nav" aria-label={t("archive")}>
    {["", ...lifecycles].map(g => <Link aria-current={g === group ? "page" : undefined} key={g} to={g ? `?lifecycle=${g}` : "?"}>
      {`${t(g || "all")} (${events.filter(e => !g || lifecycle(e, now) === g).length})`}
    </Link>)}
  </nav>
  <Failure error={query.error} locale={locale} />
  <button type="button" className="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
    {t("refresh")}
  </button>
  {query.isPending && <p role="status">
    {t("loading")}
  </p>}
  {!query.isPending && !query.isError && !rows.length && <p>
    {t("empty")}
  </p>}
  {lifecycles.filter(g => !group || group === g).map(g => {
      const entries = page.filter(e => lifecycle(e, now) === g);
      return entries.length ? <section className="insights-group" key={g}>
    <h2>
      {t(g)}
    </h2>
    {entries.map(e => <article className="insights-card" key={e.id}>
      <h3>
        <Link to={`/organizer/events/${encodeURIComponent(e.id)}/edit`}>
          {e.title}
        </Link>
      </h3>
      <p>
        {formatEventDateTime(e.starts_at, e.timezone, locale)}


         —


        {formatEventDateTime(e.ends_at, e.timezone, locale)}
      </p>
      <p>
        {t(e.status)}
      </p>
      <EventLinks id={e.id} locale={locale} />
      <DuplicateEvent id={e.id} title={e.title} locale={locale} />
    </article>)}
  </section> : null;
    })}
  <Pager locale={locale} offset={offset} total={rows.length} onChange={n => {
      const p = new URLSearchParams(params);
      p.set("offset", String(n));
      setParams(p);
    }} />
</section>;
}
