import { DuplicateEvent } from "./DuplicateEvent";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { formatEventRange } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { lifecycle, lifecycles } from "./model";
import { useOwnedEvents } from "./data";
import { label } from "./copy";
import { eventCopy } from "../events/copy";
import { Failure, Pager } from "./ui";
import { useResource } from "../events/data";
import { cityLabel, parseVenueRefs } from "../events/venues";
import type { VenueRef } from "../events/venues";
export default function Archive({
  locale
}: {
  locale: Locale;
}) {
  const t = (s: string) => label(locale, s),
    query = useOwnedEvents();
  const venues = useResource<VenueRef[]>("/api/v1/venues", parseVenueRefs);
  const place = (id: string) => {
    const venue = venues.data?.find(v => v.id === id);
    return venue ? [venue.name, venue.city && cityLabel(venue.city, locale)].filter(Boolean).join(" · ") : "";
  };
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
      {eventCopy[locale].organizer}
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
  {query.isPending && <p role="status">
    {t("loading")}
  </p>}
  {!query.isPending && !query.isError && !rows.length && <p>
    {t("empty")}
  </p>}
  {lifecycles.filter(g => !group || group === g).map(g => {
      const entries = page.filter(e => lifecycle(e, now) === g);
      return entries.length ? <section className="insights-group" key={g}>
    {!group && <h2>
      {t(g)}
    </h2>}
    {entries.map(e => <article className="insights-card organizer-event-card" key={e.id}>
      <div className="organizer-event-head">
        <h3>
          <Link to={`/organizer/events/${encodeURIComponent(e.id)}/edit`}>
            {e.title}
          </Link>
        </h3>
        <span className="status-badge" data-tone={e.status === "published" ? "success" : e.status === "cancelled" ? "danger" : "neutral"}>
          {t(e.status)}
        </span>
      </div>
      <p className="organizer-event-when">
        {formatEventRange(e.starts_at, e.ends_at, e.timezone, locale)}
        {place(e.venue_id) && <> · {place(e.venue_id)}</>}
      </p>
      {/* Past events keep the records an organizer still needs after the date. */}
      <nav className="controls card-links" aria-label={e.title}>
        {([["orders", "orders"], ["refunds", "orders?view=refunds"], ["history", "history"], ["checkin", "analytics#attendance"]] as const).map(([name, path]) => <Link className="chip-link" key={name} to={`/organizer/events/${encodeURIComponent(e.id)}/${path}`}>
            {t(name)}
          </Link>)}
      </nav>
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
