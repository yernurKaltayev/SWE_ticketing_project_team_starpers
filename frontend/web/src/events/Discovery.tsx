import { promoCopy } from "../promotions/copy";
import { operationsCopy } from "../operations/copy";
import { Link, useSearchParams } from "react-router-dom";
import { formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field, Status } from "../auth/ui";
import { eventCopy } from "./copy";
import { toneFor } from "../tone";
import { useResource } from "./data";
import { searchQuery } from "./model";
import type { Event, Page } from "./model";
import { CoverArt, EventError, Image } from "./ui";
import { commerceNavigation } from "../checkout/navigation";
import { paymentCopy } from "../payments/copy";
import { staffCopy } from "../staff/copy";
import { parseEvents } from "./contracts";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  PlusIcon,
  SearchIcon,
} from "../icons";

export function EventList({
  locale,
  organizer = false,
}: {
  locale: Locale;
  organizer?: boolean;
}) {
  const t = eventCopy[locale];
  const [params, setParams] = useSearchParams();
  const query = organizer
    ? `limit=12&offset=${new URLSearchParams(searchQuery(params)).get("offset")}`
    : searchQuery(params);
  const { data, error, reload } = useResource<Page<Event>>(
    `/api/v1/${organizer ? "organizers/me/events" : "events"}?${query}`,
    parseEvents,
  );
  const offset = Number(new URLSearchParams(query).get("offset"));
  function page(next: number) {
    const p = new URLSearchParams(params);
    p.set("offset", String(next));
    setParams(p);
  }
  return (
    <section>
      <div className="event-heading">
        <div>
          <h1>{organizer ? t.organizer : t.events}</h1>
          <p>{organizer ? t.count : t.intro}</p>
        </div>
        {organizer && (
          <Link className="action-link" to="/organizer/events/new">
            <PlusIcon />
            {t.create}
          </Link>
        )}
      </div>
      {!organizer && (
        <form
          onChange={(e) => {
            e.currentTarget
              ?.querySelector<HTMLInputElement>("#date_to")
              ?.setCustomValidity("");
          }}
          className="event-filters"
          key={params.toString()}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const p = new URLSearchParams();
            for (const key of [
              "q",
              "category",
              "city",
              "date_from",
              "date_to",
            ]) {
              const value = String(f.get(key) ?? "").trim();
              if (value) p.set(key, value);
            }
            if (
              p.get("date_from") &&
              p.get("date_to") &&
              p.get("date_from")! > p.get("date_to")!
            ) {
              e.currentTarget
                .querySelector<HTMLInputElement>("#date_to")
                ?.setCustomValidity(t.invalid);
              e.currentTarget
                .querySelector<HTMLInputElement>("#date_to")
                ?.reportValidity();
              return;
            }
            setParams(p);
          }}
        >
          <Field
            name="q"
            label={t.search}
            defaultValue={params.get("q") ?? ""}
            type="search"
          />
          <Field
            name="category"
            label={t.category}
            defaultValue={params.get("category") ?? ""}
          />
          <Field
            name="city"
            label={t.city}
            defaultValue={params.get("city") ?? ""}
          />
          <Field
            name="date_from"
            label={t.date_from}
            type="date"
            defaultValue={params.get("date_from") ?? ""}
          />
          <Field
            name="date_to"
            label={t.date_to}
            type="date"
            defaultValue={params.get("date_to") ?? ""}
          />
          <div className="controls">
            <button>
              <SearchIcon />
              {t.filter}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setParams({})}
            >
              {t.reset}
            </button>
          </div>
        </form>
      )}
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
          <div className={organizer ? "event-grid is-list" : "event-grid"}>
            {data.items.map((event) => (
              <article
                className={organizer ? "event-card" : "event-card is-public"}
                key={event.id}
              >
                <div className="event-cover">
                  <CoverArt event={event} locale={locale} />
                  {event.images[0] && (
                    <Image src={event.images[0]} title={event.title} />
                  )}
                  {event.category && (
                    <span className="event-category">{event.category}</span>
                  )}
                </div>
                <h2>
                  <Link
                    to={
                      organizer
                        ? `/organizer/events/${event.id}/edit`
                        : `/events/${event.id}`
                    }
                  >
                    {event.title}
                  </Link>
                </h2>
                <p>
                  {formatEventDateTime(event.starts_at, event.timezone, locale)}
                </p>
                {organizer && (
                  <>
                    <div className="card-footer">
                      <span
                        className="status-badge"
                        data-tone={toneFor(event.status)}
                      >
                        {t[event.status as "draft"] ?? event.status}
                      </span>
                    </div>
                    <nav className="controls">
                      <Link to={`/organizer/events/${event.id}/promotions`}>
                        {promoCopy[locale].title}
                      </Link>
                      <Link
                        to={`/organizer/events/${encodeURIComponent(event.id)}/orders`}
                      >
                        {operationsCopy[locale].title}
                      </Link>
                      <Link
                        to={`/organizer/events/${encodeURIComponent(event.id)}/activation`}
                      >
                        {paymentCopy[locale].activation}
                      </Link>
                      <Link
                        to={`/organizer/events/${encodeURIComponent(event.id)}/financials`}
                      >
                        {paymentCopy[locale].finances}
                      </Link>
                      <Link
                        to={`/organizer/events/${encodeURIComponent(event.id)}/staff`}
                      >
                        {staffCopy[locale].link}
                      </Link>
                    </nav>
                  </>
                )}
                {!organizer && event.status === "published" && (
                  <div className="card-footer">
                    <Link to={`/events/${event.id}/checkout`}>
                      {commerceNavigation[locale].register}
                    </Link>
                    <ArrowRightIcon className="card-arrow" />
                  </div>
                )}
              </article>
            ))}
          </div>
          {(offset > 0 || offset + data.items.length < data.total) && (
            <nav className="pager" aria-label={t.results}>
              <button
                className="secondary"
                disabled={offset === 0}
                onClick={() => page(Math.max(0, offset - 12))}
              >
                <ArrowLeftIcon />
                {t.previous}
              </button>
              <button
                className="secondary"
                disabled={offset + data.items.length >= data.total}
                onClick={() => page(offset + 12)}
              >
                {t.next}
                <ArrowRightIcon />
              </button>
            </nav>
          )}
        </>
      )}
    </section>
  );
}
