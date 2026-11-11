import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { useEventRequest, useResource } from "../events/data";
import { parseEvent, parseTicketTypes } from "../events/contracts";
import { seatingCopy } from "./copy";
import { parseLayouts } from "./model";
import { SeatPicker } from "./SeatPicker";
export function SeatPage({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  const request = useEventRequest();
  return (
    <>
      <Link to={`/events/${encodeURIComponent(eventId)}`}>
        {seatingCopy[locale].back}
      </Link>
      <SeatPicker
        key={eventId}
        eventId={eventId}
        request={request}
        locale={locale}
      />
    </>
  );
}
export function SeatingSetup({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  const t = seatingCopy[locale];
  const event = useResource(
    `/api/v1/events/${encodeURIComponent(eventId)}`,
    parseEvent,
  );
  return (
    <>
      <Link to={`/organizer/events/${encodeURIComponent(eventId)}/edit`}>
        {t.back}
      </Link>
      <h1>{t.setup}</h1>
      {event.error ? (
        <p role="alert">
          {t.error}
          <button onClick={event.reload}>{t.refresh}</button>
        </p>
      ) : event.data ? (
        <SetupForm key={eventId} event={event.data} locale={locale} />
      ) : (
        <p>{t.loading}</p>
      )}
    </>
  );
}
function SetupForm({
  event,
  locale,
}: {
  event: ReturnType<typeof parseEvent>;
  locale: Locale;
}) {
  const t = seatingCopy[locale];
  const request = useEventRequest();
  const layouts = useResource(
    `/api/v1/venues/${encodeURIComponent(event.venue_id)}/layouts`,
    parseLayouts,
  );
  const tickets = useResource(
    `/api/v1/events/${encodeURIComponent(event.id)}/ticket-types`,
    parseTicketTypes,
  );
  const [layout, setLayout] = useState(event.layout_id ?? "");
  const [assigned, setAssigned] = useState(event.seating_mode === "assigned");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"saved" | "error" | null>(null);
  const draft = event.status === "draft";
  return (
    <div className="seating">
      <p>{t.draft}</p>
      <form
        onChange={() => setResult(null)}
        onSubmit={(e) => {
          e.preventDefault();
          if (busy || !draft) return;
          if (
            assigned &&
            !layouts.data?.some(
              (l) => l.id === layout && l.venue_id === event.venue_id,
            )
          ) {
            setResult("error");
            return;
          }
          setBusy(true);
          setResult(null);
          void request(`/api/v1/events/${encodeURIComponent(event.id)}`, {
            method: "PATCH",
            body: {
              seating_mode: assigned ? "assigned" : "general_admission",
              layout_id: assigned ? layout : null,
            },
          })
            .then(() => setResult("saved"))
            .catch(() => setResult("error"))
            .finally(() => setBusy(false));
        }}
      >
        <fieldset disabled={busy || !draft}>
          <legend>{t.setup}</legend>
          <label>
            {t.setup}
            <select
              value={assigned ? "assigned" : "general_admission"}
              onChange={(e) => setAssigned(e.target.value === "assigned")}
            >
              <option value="general_admission">{t.general}</option>
              <option value="assigned">{t.assigned}</option>
            </select>
          </label>
          {assigned && (
            <label>
              {t.layout}
              <select
                required
                value={layout}
                onChange={(e) => setLayout(e.target.value)}
              >
                <option value="">{t.none}</option>
                {layouts.data
                  ?.filter((l) => l.venue_id === event.venue_id)
                  .map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <button
            disabled={
              assigned &&
              !layouts.data?.some(
                (l) => l.id === layout && l.venue_id === event.venue_id,
              )
            }
          >
            {t.save}
          </button>
        </fieldset>
      </form>
      {!!layouts.error && (
        <p role="alert">
          {t.error}
          <button onClick={layouts.reload}>{t.refresh}</button>
        </p>
      )}
      {layouts.data?.length === 0 && <p>{t.empty}</p>}
      {result && (
        <p role={result === "error" ? "alert" : "status"}>{t[result]}</p>
      )}
      <h2>{t.category}</h2>
      <p>{t.categoryHint}</p>
      {!!tickets.error && (
        <p role="alert">
          {t.error}
          <button onClick={tickets.reload}>{t.refresh}</button>
        </p>
      )}
      {tickets.data?.items.map((ticket) => (
        <CategoryForm
          key={ticket.id}
          eventId={event.id}
          ticket={ticket}
          locale={locale}
          disabled={!draft || busy}
        />
      ))}
    </div>
  );
}
function CategoryForm({
  eventId,
  ticket,
  locale,
  disabled,
}: {
  eventId: string;
  ticket: ReturnType<typeof parseTicketTypes>["items"][number];
  locale: Locale;
  disabled: boolean;
}) {
  const request = useEventRequest();
  const t = seatingCopy[locale];
  const [value, setValue] = useState(ticket.price_category ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"categorySaved" | "error" | null>(null);
  return (
    <form
      onChange={() => setResult(null)}
      onSubmit={(e) => {
        e.preventDefault();
        if (busy || disabled) return;
        setBusy(true);
        setResult(null);
        void request(
          `/api/v1/events/${encodeURIComponent(eventId)}/ticket-types/${encodeURIComponent(ticket.id)}`,
          { method: "PATCH", body: { price_category: value.trim() || null } },
        )
          .then(() => setResult("categorySaved"))
          .catch(() => setResult("error"))
          .finally(() => setBusy(false));
      }}
    >
      <fieldset disabled={busy || disabled}>
        <legend>{ticket.name}</legend>
        <label>
          {t.category}
          <input
            value={value}
            maxLength={120}
            onChange={(e) => setValue(e.target.value)}
          />
        </label>
        <button>{t.save}</button>
      </fieldset>
      {result && (
        <p role={result === "error" ? "alert" : "status"}>{t[result]}</p>
      )}
    </form>
  );
}
