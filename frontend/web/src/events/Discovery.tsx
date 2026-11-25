import { label as insightLabel } from "../insights/copy";
import { operationsCopy } from "../operations/copy";
import { Link, useSearchParams } from "react-router-dom";
import { formatEventDateTime } from "@biletflow/shared";
import { categoryLabel, knownCategories } from "./categories";
import type { Locale } from "@biletflow/shared";
import { Field, Status } from "../auth/ui";
import { eventCopy } from "./copy";
import type { EventCopy } from "./copy";
import { discoveryCopy } from "./discoveryCopy";
import { offerLabel } from "./offerLabel";
import { toneFor } from "../tone";
import { useResource } from "./data";
import {
  activeRange,
  categoryTone,
  offerSummary,
  quickRange,
  searchQuery,
} from "./model";
import type { Availability, Event, Page, QuickRange } from "./model";
import { CoverArt, EventError, Image } from "./ui";
import { commerceNavigation } from "../checkout/navigation";
import { parseEvents, parsePublicAvailability } from "./contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  CalendarIcon,
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

type VenueRef = { id: string; name: string; city: string };
/**
 * Live P4 returns a bare array whose address/city may be null; older fixtures
 * return a page. Rows without a usable id/name are skipped, never invented.
 */
function parseVenueRefs(value: unknown): VenueRef[] {
  const rows = Array.isArray(value)
    ? value
    : value && typeof value === "object" && Array.isArray((value as { items?: unknown }).items)
      ? (value as { items: unknown[] }).items
      : [];
  return rows.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const { id, name, city } = row as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string") return [];
    return [{ id, name, city: typeof city === "string" ? city.trim() : "" }];
  });
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
  const cities = [
    ...new Set(
      [...(venues.data ?? []).map((v) => v.city), params.get("city") ?? ""].filter(
        Boolean,
      ),
    ),
  ].sort((a, b) => a.localeCompare(b));
  // Suggested categories plus any other text organizers used, one entry per
  // case-insensitive value (the API filters with ILIKE), labelled in the UI language.
  const categories = [
    ...new Map(
      [
        ...knownCategories,
        ...(data?.items ?? []).map((e) => e.category.trim()),
        params.get("category") ?? "",
      ]
        .filter(Boolean)
        .map((c) => [c.toLowerCase(), c] as const),
    ).values(),
  ].sort((a, b) =>
    categoryLabel(a, locale).localeCompare(categoryLabel(b, locale)),
  );
  const offset = Number(new URLSearchParams(query).get("offset"));
  const range = activeRange(params);
  const hasFilters = filterKeys.some((key) => params.get(key));
  const customDates = !range && Boolean(params.get("date_from") || params.get("date_to"));

  function update(changes: Partial<Record<(typeof filterKeys)[number], string>>) {
    const p = new URLSearchParams();
    for (const key of filterKeys) {
      const value = (key in changes ? changes[key] : params.get(key))?.trim();
      if (value) p.set(key, value);
    }
    setParams(p);
  }
  function submit(form: HTMLFormElement) {
    const f = new FormData(form);
    const next: Record<string, string> = {};
    for (const key of filterKeys) next[key] = String(f.get(key) ?? "").trim();
    const to = form.querySelector<HTMLInputElement>("#date_to");
    if (next.date_from && next.date_to && next.date_from > next.date_to) {
      to?.setCustomValidity(t.invalid);
      to?.reportValidity();
      return;
    }
    update(next);
  }
  function chooseRange(kind?: QuickRange) {
    update(kind ? quickRange(kind) : { date_from: "", date_to: "" });
  }

  return (
    <section className="discovery">
      <form
        className="discovery-hero"
        key={params.toString()}
        onChange={(e) => {
          e.currentTarget
            .querySelector<HTMLInputElement>("#date_to")
            ?.setCustomValidity("");
        }}
        onSubmit={(e) => {
          e.preventDefault();
          submit(e.currentTarget);
        }}
      >
        <div className="discovery-intro">
          <h1>{t.events}</h1>
          <p>{d.heroIntro}</p>
        </div>
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
        <div className="discovery-filters" aria-label={d.filters} role="group">
          <div className="field">
            <label htmlFor="category">{t.category}</label>
            <select
              id="category"
              name="category"
              defaultValue={params.get("category") ?? ""}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              <option value="">{d.allCategories}</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {categoryLabel(c, locale)}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label htmlFor="city">{t.city}</label>
            <select
              id="city"
              name="city"
              defaultValue={params.get("city") ?? ""}
              onChange={(e) => e.currentTarget.form?.requestSubmit()}
            >
              <option value="">{d.allCities}</option>
              {cities.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div className="field date-chips">
            <span className="field-label" id="date-chips-label">
              {d.dates}
            </span>
            <div className="chip-row" role="group" aria-labelledby="date-chips-label">
              {(
                [
                  [undefined, d.anyDate],
                  ["today", d.today],
                  ["weekend", d.weekend],
                  ["month", d.month],
                ] as const
              ).map(([kind, label]) => {
                const pressed = kind
                  ? range === kind
                  : !params.get("date_from") && !params.get("date_to");
                return (
                  <button
                    key={label}
                    type="button"
                    className="chip"
                    aria-pressed={pressed}
                    onClick={() => chooseRange(kind)}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <details className="custom-dates" open={customDates}>
            <summary>
              <CalendarIcon size={16} />
              {d.moreFilters}
            </summary>
            <div className="custom-dates-fields">
              <Field
                name="date_from"
                label={t.date_from}
                type="date"
                defaultValue={params.get("date_from") ?? ""}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
              <Field
                name="date_to"
                label={t.date_to}
                type="date"
                defaultValue={params.get("date_to") ?? ""}
                onChange={(e) => e.currentTarget.form?.requestSubmit()}
              />
            </div>
          </details>
        </div>
      </form>
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
          offer?.onSale &&
          offer.remaining <= LOW_STOCK && (
            <span className="status-badge cover-badge" data-tone="warning">
              {d.left}: {offer.remaining}
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
            {venue.city ? `${venue.name} · ${venue.city}` : venue.name}
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
            {commerceNavigation[locale].register}
            <ArrowRightIcon className="card-arrow" size={16} />
          </Link>
        )}
      </div>
    </article>
  );
}
