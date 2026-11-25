import { label as insightLabel } from "../insights/copy";
import { operationsCopy } from "../operations/copy";
import { useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { CategoryBar, DateStrip, FeaturedCarousel } from "./DiscoveryParts";
import { readCity } from "./city";
import { formatEventDateTime } from "@biletflow/shared";
import { categoryLabel } from "./categories";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { eventCopy } from "./copy";
import type { EventCopy } from "./copy";
import { discoveryCopy } from "./discoveryCopy";
import { offerLabel } from "./offerLabel";
import { toneFor } from "../tone";
import { useResource } from "./data";
import { categoryTone, offerSummary, searchQuery } from "./model";
import type { Availability, Event, Page } from "./model";
import { CoverArt, EventError, Image } from "./ui";
import { commerceAction } from "../checkout/navigation";
import { parseEvents, parsePublicAvailability } from "./contracts";
import { cityLabel, parseVenueRefs } from "./venues";
import type { VenueRef } from "./venues";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PinIcon,
  PlusIcon,
  SearchIcon,
} from "../icons";

const filterKeys = ["q", "category", "city", "date_from", "date_to"] as const;

export function EventList({
  locale,
  organizer = false,
}: {
  locale: Locale;
  organizer?: boolean;
}) {
  return organizer ? (
    <OrganizerEventList locale={locale} />
  ) : (
    <PublicEventList locale={locale} />
  );
}

function Pager({
  offset,
  shown,
  total,
  label,
  t,
  onPage,
}: {
  offset: number;
  shown: number;
  total: number;
  label: string;
  t: EventCopy;
  onPage: (next: number) => void;
}) {
  if (offset === 0 && offset + shown >= total) return null;
  return (
    <nav className="pager" aria-label={label}>
      <button
        className="secondary"
        disabled={offset === 0}
        onClick={() => onPage(Math.max(0, offset - 12))}
      >
        <ArrowLeftIcon />
        {t.previous}
      </button>
      <button
        className="secondary"
        disabled={offset + shown >= total}
        onClick={() => onPage(offset + 12)}
      >
        {t.next}
        <ArrowRightIcon />
      </button>
    </nav>
  );
}

function usePaging() {
  const [params, setParams] = useSearchParams();
  return {
    params,
    setParams,
    page(next: number) {
      const p = new URLSearchParams(params);
      p.set("offset", String(next));
      setParams(p);
    },
  };
}

function OrganizerEventList({ locale }: { locale: Locale }) {
  const t = eventCopy[locale];
  const { params, page } = usePaging();
  const query = `limit=12&offset=${new URLSearchParams(searchQuery(params)).get("offset")}`;
  const { data, error, reload } = useResource<Page<Event>>(
    `/api/v1/organizers/me/events?${query}`,
    parseEvents,
  );
  const offset = Number(new URLSearchParams(query).get("offset"));
  return (
    <section>
      <div className="event-heading">
        <div>
          <h1>{t.organizer}</h1>
          <p>{t.count}</p>
        </div>
        <Link className="action-link" to="/organizer/events/new">
          <PlusIcon />
          {t.create}
        </Link>
      </div>
      <EventError error={error} t={t} retry={reload} />
      {!data && !error && <Status>{t.loading}</Status>}
      {data && (
        <>
          <div className="results-meta">
            <p role="status">
              {t.results}: {data.total}
            </p>
          </div>
          {data.items.length === 0 && (
            <div className="empty-state" role="status">
              <SearchIcon size={22} />
              <p>{t.empty}</p>
            </div>
          )}
          <div className="event-grid is-list">
            {data.items.map((event) => (
              <article className="event-card" key={event.id}>
                <div className="event-cover">
                  <CoverArt event={event} locale={locale} />
                  {event.images[0] && (
                    <Image src={event.images[0]} title={event.title} />
                  )}
                  {event.category && (
                    <span className="event-category">
                      {categoryLabel(event.category, locale)}
                    </span>
                  )}
                </div>
                <h2>
                  <Link to={`/organizer/events/${event.id}/edit`}>
                    {event.title}
                  </Link>
                </h2>
                <p>
                  {formatEventDateTime(event.starts_at, event.timezone, locale)}
                </p>
                <div className="card-footer">
                  <span
                    className="status-badge"
                    data-tone={toneFor(event.status)}
                  >
                    {t[event.status as "draft"] ?? event.status}
                  </span>
                </div>
                {/* Everything else for this event lives in the sidebar once it is open. */}
                <nav className="controls card-actions">
                  <Link
                    to={`/organizer/events/${encodeURIComponent(event.id)}/orders`}
                  >
                    {operationsCopy[locale].title}
                  </Link>
                  <Link
                    to={`/organizer/events/${encodeURIComponent(event.id)}/analytics`}
                  >
                    {insightLabel(locale, "analytics")}
                  </Link>
                </nav>
              </article>
            ))}
          </div>
          <Pager
            offset={offset}
            shown={data.items.length}
            total={data.total}
            label={t.results}
            t={t}
            onPage={page}
          />
        </>
      )}
    </section>
  );
}

function PublicEventList({ locale }: { locale: Locale }) {
  const t = eventCopy[locale];
  const d = discoveryCopy[locale];
  const { params, setParams, page } = usePaging();
  const query = searchQuery(params);
  const { data, error, reload } = useResource<Page<Event>>(
    `/api/v1/events?${query}`,
    parseEvents,
  );
  const venues = useResource<VenueRef[]>("/api/v1/venues", parseVenueRefs);
  const venueById = new Map((venues.data ?? []).map((v) => [v.id, v]));
  const offset = Number(new URLSearchParams(query).get("offset"));
  const hasFilters = filterKeys.some((key) => params.get(key));
  // The banner is a front page, not a search result: hide it once the buyer narrows the list.
  const browsing = !["q", "category", "date_from", "date_to"].some((key) => params.get(key));
  const savedCity = params.has("city") ? "" : readCity();
  useEffect(() => {
    if (savedCity) {
      const p = new URLSearchParams(params);
      p.set("city", savedCity);
      setParams(p, { replace: true });
    }
  }, [savedCity, params, setParams]);

  function update(changes: Partial<Record<(typeof filterKeys)[number], string>>) {
    const p = new URLSearchParams();
    for (const key of filterKeys) {
      const value = (key in changes ? changes[key] : params.get(key))?.trim();
      if (value) p.set(key, value);
    }
    setParams(p);
  }

  return (
    <section className="discovery">
      <h1 className="visually-hidden">{t.events}</h1>
      <CategoryBar
        value={params.get("category") ?? ""}
        locale={locale}
        onChange={(category) => update({ category })}
      />
      {browsing && (
        <FeaturedCarousel
          city={params.get("city") ?? ""}
          venues={venueById}
          locale={locale}
        />
      )}
      <form
        className="discovery-search"
        key={params.get("q") ?? ""}
        onSubmit={(e) => {
          e.preventDefault();
          update({ q: String(new FormData(e.currentTarget).get("q") ?? "") });
        }}
      >
        <div className="hero-search">
          <SearchIcon className="hero-search-icon" size={20} />
          <label className="visually-hidden" htmlFor="q">
            {t.search}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            placeholder={d.searchPlaceholder}
            defaultValue={params.get("q") ?? ""}
          />
          <button>{d.searchSubmit}</button>
        </div>
      </form>
      <DateStrip
        from={params.get("date_from") ?? ""}
        to={params.get("date_to") ?? ""}
        locale={locale}
        onChange={(day) => update({ date_from: day ?? "", date_to: day ?? "" })}
      />
      <EventError error={error} t={t} retry={reload} />
      {!data && !error && <Status>{t.loading}</Status>}
      {data && (
        <>
          <div className="results-meta">
            <p role="status">
              {t.results}: {data.total}
            </p>
            {hasFilters && (
              <button
                type="button"
                className="link-button"
                onClick={() => setParams({})}
              >
                {t.reset}
              </button>
            )}
          </div>
          {data.items.length === 0 && (
            <div className="empty-state" role="status">
              <span className="empty-icon">
                <SearchIcon size={24} />
              </span>
              <strong>{d.emptyTitle}</strong>
              <p>
                {t.empty} {d.emptyHint}
              </p>
            </div>
          )}
          <div className="event-grid">
            {data.items.map((event) => (
              <PublicEventCard
                key={event.id}
                event={event}
                venue={venueById.get(event.venue_id)}
                locale={locale}
              />
            ))}
          </div>
          <Pager
            offset={offset}
            shown={data.items.length}
            total={data.total}
            label={t.results}
            t={t}
            onPage={page}
          />
        </>
      )}
    </section>
  );
}

/** Low stock is shown only when it is genuinely low, from live availability. */
const LOW_STOCK = 20;

function PublicEventCard({
  event,
  venue,
  locale,
}: {
  event: Event;
  venue?: VenueRef;
  locale: Locale;
}) {
  const d = discoveryCopy[locale];
  const tickets = useResource<Availability[]>(
    `/api/v1/events/${encodeURIComponent(event.id)}/availability`,
    parsePublicAvailability,
  );
  const offer = tickets.data ? offerSummary(tickets.data) : null;
  const tone = categoryTone(event.category);
  return (
    <article className="event-card is-public">
      <div className="event-cover" data-cover-tone={tone || undefined}>
        <CoverArt event={event} locale={locale} />
        {event.images[0] && <Image src={event.images[0]} title={event.title} />}
        {event.category && (
          <span className="event-category">
                      {categoryLabel(event.category, locale)}
                    </span>
        )}
        {offer?.soldOut ? (
          <span className="status-badge cover-badge" data-tone="neutral">
            {d.soldOut}
          </span>
        ) : (
          offer &&
          offer.remaining <= LOW_STOCK && (
            <span className="status-badge cover-badge" data-tone="warning">
              {d.left(offer.remaining)}
            </span>
          )
        )}
      </div>
      <h2>
        <Link to={`/events/${event.id}`}>{event.title}</Link>
      </h2>
      <ul className="event-meta">
        {venue && (
          <li>
            <PinIcon size={16} />
            {venue.city ? `${venue.name} · ${cityLabel(venue.city, locale)}` : venue.name}
          </li>
        )}
      </ul>
      <div className="card-footer">
        <div className="offer">
          {offer && (
            <strong className="price">
              {offerLabel(offer, locale)}
            </strong>
          )}
        </div>
        {event.status === "published" && !offer?.soldOut && (
          <Link className="card-cta" to={`/events/${event.id}/checkout`}>
            {commerceAction(locale, offer?.allFree)}
            <ArrowRightIcon className="card-arrow" size={16} />
          </Link>
        )}
      </div>
    </article>
  );
}
