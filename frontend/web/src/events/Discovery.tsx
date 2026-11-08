import { Link, useSearchParams } from "react-router-dom";
import { formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field, Status } from "../auth/ui";
import { eventCopy } from "./copy";
import { useResource } from "./data";
import { searchQuery } from "./model";
import type { Event, Page } from "./model";
import { EventError, Image } from "./ui";
import { commerceNavigation } from "../checkout/navigation";

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
            <button>{t.filter}</button>
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
          <p role="status">
            {t.results}: {data.total}
          </p>
          {data.items.length === 0 && <Status>{t.empty}</Status>}
          <div className="event-grid">
            {data.items.map((event) => (
              <article className="event-card" key={event.id}>
                {event.images[0] && (
                  <Image src={event.images[0]} title={event.title} />
                )}
                <span className="event-category">{event.category}</span>
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
                  <span className="status-badge">
                    {t[event.status as "draft"] ?? event.status}
                  </span>
                )}
                {!organizer && (
                  <Link to={`/events/${event.id}/checkout`}>
                    {commerceNavigation[locale].register}
                  </Link>
                )}
              </article>
            ))}
          </div>
          <nav className="controls" aria-label={t.results}>
            <button
              disabled={offset === 0}
              onClick={() => page(Math.max(0, offset - 12))}
            >
              {t.previous}
            </button>
            <button
              disabled={offset + data.items.length >= data.total}
              onClick={() => page(offset + 12)}
            >
              {t.next}
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
