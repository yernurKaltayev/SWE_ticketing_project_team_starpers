import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field, Status } from "../auth/ui";
import { useSession } from "../auth/session";
import { eventCopy } from "./copy";
import { useEventRequest, useResource } from "./data";
import {
  eventBody,
  InputError,
  ticketBody,
  toInstant,
  zonedInput,
  priceInput,
} from "./model";
import type { Event, Page, Ticket, Venue } from "./model";
import { EventError, Image, SelectField, TextArea } from "./ui";
import { parseEvent, parseVenues, parseTicketTypes } from "./contracts";

export function EventEditor({ locale }: { locale: Locale }) {
  const { eventId } = useParams();
  const t = eventCopy[locale];
  const resource = useResource<Event>(
    eventId ? `/api/v1/events/${encodeURIComponent(eventId)}` : "",
    parseEvent,
  );
  if (eventId && !resource.data)
    return (
      <>
        <EventError error={resource.error} t={t} retry={resource.reload} />
        {!resource.error && <Status>{t.loading}</Status>}
      </>
    );
  return (
    <EditorForm
      key={eventId ?? "new"}
      initial={eventId ? resource.data : undefined}
      locale={locale}
    />
  );
}
function EditorForm({ initial, locale }: { initial?: Event; locale: Locale }) {
  const t = eventCopy[locale];
  const navigate = useNavigate();
  const request = useEventRequest();
  const { user } = useSession();
  const [event, setEvent] = useState(initial);
  const [revision, setRevision] = useState(0);
  const [dirty, setDirty] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const [action, setAction] = useState<
    "publish" | "unpublish" | "cancel" | null
  >(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const actionButton = useRef<HTMLButtonElement>(null);
  const [venueOffset, setVenueOffset] = useState(0);
  const moreVenues = useResource<Page<Venue>>(
    `/api/v1/venues?limit=100&offset=${venueOffset}`,
    parseVenues,
  );
  const [venueOptions, setVenueOptions] = useState<Venue[]>([]);
  // Accumulating paginated remote results synchronizes the venue selector with the API.
  useEffect(() => {
    if (moreVenues.data)
      // oxlint-disable-next-line react/set-state-in-effect
      setVenueOptions((old) => [
        ...new Map(
          [...old, ...moreVenues.data!.items].map((v) => [v.id, v]),
        ).values(),
      ]);
  }, [moreVenues.data]);
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  useEffect(() => {
    if (action) dialog.current?.showModal();
    else if (dialog.current?.open) dialog.current.close();
  }, [action]);
  const zone = event?.timezone ?? "Asia/Almaty";
  const disabled =
    pending ||
    event?.status === "cancelled" ||
    event?.seating_mode === "assigned";
  function closeDialog() {
    if (pending) return;
    setAction(null);
    actionButton.current?.focus();
  }
  async function mutate(
    kind: "publish" | "unpublish" | "duplicate" | "cancel",
  ) {
    if (!event || pending || dirty) return;
    setPending(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = parseEvent(
        await request(`/api/v1/events/${event.id}/${kind}`, { method: "POST" }),
      );
      if (kind === "duplicate") navigate(`/organizer/events/${result.id}/edit`);
      else {
        setEvent(result);
        setRevision((n) => n + 1);
        setAction(null);
        setSaved(true);
      }
    } catch (e) {
      setAction(null);
      setError(e);
    } finally {
      setPending(false);
      actionButton.current?.focus();
    }
  }
  return (
    <section>
      <Link to="/organizer/events">{t.back}</Link>
      <h1>{event ? t.edit : t.create}</h1>
      {event && (
        <p>
          <span className="status-badge">
            {t[event.status as "draft"] ?? event.status}
          </span>
        </p>
      )}
      <EventError error={error} t={t} />
      {saved && <Status>{t.saved}</Status>}
      <EventError
        error={moreVenues.error}
        t={t}
        retry={() => {
          moreVenues.reload();
        }}
      />
      <p id="zone-hint">{t.zoneHint}</p>
      {event?.seating_mode === "assigned" && <Status>{t.assignedHint}</Status>}
      <form
        key={revision}
        onChange={() => {
          setDirty(true);
          setSaved(false);
        }}
        onSubmit={(e) => {
          e.preventDefault();
          if (disabled) return;
          const form = new FormData(e.currentTarget);
          setError(undefined);
          setSaved(false);
          let body;
          try {
            body = eventBody(form);
          } catch (err) {
            setError(err);
            return;
          }
          setPending(true);
          void request(
            event ? `/api/v1/events/${event.id}` : "/api/v1/events",
            { method: event ? "PATCH" : "POST", body },
          )
            .then(parseEvent)
            .then((result) => {
              setDirty(false);
              setEvent(result);
              setRevision((n) => n + 1);
              setSaved(true);
              if (!event)
                navigate(`/organizer/events/${result.id}/edit`, {
                  replace: true,
                });
            })
            .catch(setError)
            .finally(() => setPending(false));
        }}
      >
        <fieldset disabled={disabled}>
          <Field
            name="title"
            label={t.title}
            defaultValue={event?.title}
            required
            maxLength={300}
          />
          <TextArea
            name="description"
            label={t.description}
            value={event?.description}
            required
          />
          <div className="event-form-grid">
            <Field
              name="category"
              label={t.category}
              defaultValue={event?.category}
              required
            />
            <SelectField
              name="venue_id"
              label={t.venue_id}
              defaultValue={event?.venue_id}
              required
            >
              <option value="">—</option>
              {event && !venueOptions.some((v) => v.id === event.venue_id) && (
                <option value={event.venue_id}>{event.venue_id}</option>
              )}
              {venueOptions.map((venue) => (
                <option key={venue.id} value={venue.id}>
                  {venue.name} · {venue.city} · {venue.address}
                </option>
              ))}
            </SelectField>
          </div>
          {moreVenues.data &&
            moreVenues.data.offset + moreVenues.data.limit <
              moreVenues.data.total && (
              <button
                type="button"
                className="secondary"
                onClick={() =>
                  setVenueOffset(
                    moreVenues.data!.offset + moreVenues.data!.limit,
                  )
                }
              >
                {t.next} · {t.venue_id}
              </button>
            )}
          <Field
            name="timezone"
            label={t.timezone}
            defaultValue={zone}
            required
            aria-describedby="zone-hint"
            list="timezones"
          />
          <datalist id="timezones">
            <option value="Asia/Almaty" />
            <option value="Asia/Qyzylorda" />
            <option value="UTC" />
          </datalist>
          <div className="event-form-grid">
            {(
              [
                "starts_at",
                "ends_at",
                "registration_opens_at",
                "registration_closes_at",
              ] as const
            ).map((key) => (
              <Field
                key={key}
                name={key}
                label={t[key]}
                type="datetime-local"
                defaultValue={zonedInput(event?.[key], zone)}
                required={key === "starts_at" || key === "ends_at"}
              />
            ))}
          </div>
          <div className="event-form-grid">
            <Field
              name="capacity"
              label={t.capacity}
              type="number"
              min="1"
              step="1"
              defaultValue={event?.capacity ?? 100}
              required
            />
            <SelectField
              name="visibility"
              label={t.visibility}
              defaultValue={event?.visibility ?? "public"}
            >
              {(["public", "unlisted", "private"] as const).map((v) => (
                <option key={v} value={v}>
                  {t[v]}
                </option>
              ))}
            </SelectField>
          </div>
          <button>{pending ? t.working : t.save}</button>
        </fieldset>
      </form>
      {dirty && <Status>{t.dirty}</Status>}
      {event && (
        <>
          <div className="controls">
            {!dirty && (
              <Link to={`/organizer/events/${event.id}/preview`}>
                {t.preview}
              </Link>
            )}
            {event.status !== "cancelled" && (
              <button
                ref={actionButton}
                disabled={disabled || dirty || !user?.email_verified_at}
                onClick={() =>
                  setAction(
                    event.status === "published" ? "unpublish" : "publish",
                  )
                }
              >
                {event.status === "published" ? t.unpublish : t.publish}
              </button>
            )}
            {event.status !== "cancelled" && (
              <button
                className="secondary"
                disabled={pending || dirty}
                onClick={() => setAction("cancel")}
              >
                {t.cancel}
              </button>
            )}
            <button
              className="secondary"
              disabled={pending || dirty}
              onClick={() => void mutate("duplicate")}
            >
              {t.duplicate}
            </button>
          </div>
          {!user?.email_verified_at && <p>{t.verified}</p>}
          <dialog
            ref={dialog}
            onCancel={(e) => {
              e.preventDefault();
              closeDialog();
            }}
            onClose={() => setAction(null)}
            aria-labelledby="publication-title"
            aria-describedby="publication-description"
          >
            <h2 id="publication-title">{t.confirmTitle}</h2>
            <p id="publication-description">
              {action === "publish"
                ? t.publishHint
                : action === "cancel"
                  ? t.cancelHint
                  : t.unpublishHint}
            </p>
            <div className="controls">
              <button
                autoFocus
                disabled={pending}
                className="secondary"
                onClick={closeDialog}
              >
                {t.dismiss}
              </button>
              <button
                disabled={pending}
                onClick={() => action && void mutate(action)}
              >
                {pending ? t.working : t.confirm}
              </button>
            </div>
          </dialog>
          <TicketEditor
            event={event}
            locale={locale}
            locked={pending || dirty || event.status === "cancelled"}
          />
          <RefundEditor
            event={event}
            locale={locale}
            locked={pending || dirty || event.status === "cancelled"}
          />
          <h2>{t.images}</h2>
          <p>{t.uploadGap}</p>
          <div className="event-grid">
            {event.images.map((src) => (
              <Image key={src} src={src} title={event.title} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
function TicketEditor({
  event,
  locale,
  locked,
}: {
  event: Event;
  locale: Locale;
  locked: boolean;
}) {
  const t = eventCopy[locale];
  const request = useEventRequest();
  const [offset, setOffset] = useState(0);
  const tickets = useResource<Page<Ticket>>(
    `/api/v1/events/${event.id}/ticket-types?limit=20&offset=${offset}`,
    parseTicketTypes,
  );
  const [selected, select] = useState<Ticket | null | undefined>();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <section aria-labelledby="ticket-title">
      <h2 id="ticket-title">{t.tickets}</h2>
      <EventError error={tickets.error} t={t} retry={tickets.reload} />
      {!tickets.data && !tickets.error && <Status>{t.loading}</Status>}
      {tickets.data?.items.length === 0 && <p>{t.ticketEmpty}</p>}
      <div className="table-scroll">
        <table>
          <caption>{t.tickets}</caption>
          <thead>
            <tr>
              {[
                "name",
                "price",
                "quantity_total",
                "available",
                "reserved",
                "sold",
                "refunded",
                "checked_in",
                "is_hidden",
              ].map((key) => (
                <th scope="col" key={key}>
                  {t[key as keyof typeof t]}
                </th>
              ))}
              <th scope="col">{t.edit}</th>
            </tr>
          </thead>
          <tbody>
            {tickets.data?.items.map((ticket) => (
              <tr key={ticket.id}>
                <th scope="row">{ticket.name}</th>
                <td>{formatMoney(ticket.price_amount ?? 0, locale)}</td>
                <td>{ticket.quantity_total}</td>
                {(
                  [
                    "available",
                    "reserved",
                    "sold",
                    "refunded",
                    "checked_in",
                  ] as const
                ).map((key) => (
                  <td key={key}>{ticket[key]}</td>
                ))}
                <td>{ticket.is_hidden ? "✓" : "—"}</td>
                <td>
                  <button
                    className="secondary"
                    disabled={locked || pending}
                    onClick={() => {
                      select(ticket);
                      setError(undefined);
                      setSaved(false);
                    }}
                  >
                    {t.editTicket}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tickets.data && (
        <div className="controls">
          <button
            className="secondary"
            disabled={offset === 0 || pending}
            onClick={() => setOffset((n) => Math.max(0, n - 20))}
          >
            {t.previous}
          </button>
          <button
            className="secondary"
            disabled={
              tickets.data.offset + tickets.data.limit >= tickets.data.total ||
              pending
            }
            onClick={() =>
              setOffset(tickets.data!.offset + tickets.data!.limit)
            }
          >
            {t.next}
          </button>
        </div>
      )}
      {selected === undefined && (
        <button
          disabled={locked}
          onClick={() => {
            select(null);
            setSaved(false);
            setError(undefined);
          }}
        >
          {t.addTicket}
        </button>
      )}
      {saved && <Status>{t.saved}</Status>}
      {selected !== undefined && (
        <form
          key={selected?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            if (locked || pending) return;
            setError(undefined);
            let body;
            try {
              body = ticketBody(new FormData(e.currentTarget), event.timezone);
            } catch (err) {
              setError(err);
              return;
            }
            setPending(true);
            void request<Ticket>(
              `/api/v1/events/${event.id}/ticket-types${selected ? `/${selected.id}` : ""}`,
              { method: selected ? "PATCH" : "POST", body },
            )
              .then(() => {
                select(undefined);
                setSaved(true);
                tickets.reload();
              })
              .catch(setError)
              .finally(() => setPending(false));
          }}
        >
          <h3>{selected ? t.editTicket : t.addTicket}</h3>
          <EventError error={error} t={t} />
          <fieldset disabled={locked || pending}>
            <Field
              name="name"
              label={t.name}
              required
              defaultValue={selected?.name}
            />
            <TextArea
              name="ticket_description"
              label={t.ticket_description}
              value={selected?.description ?? ""}
            />
            <div className="event-form-grid">
              <Field
                name="price"
                label={t.price}
                inputMode="decimal"
                required
                defaultValue={priceInput(selected?.price_amount ?? 0)}
              />
              <Field
                name="quantity_total"
                label={t.quantity_total}
                type="number"
                min="1"
                required
                defaultValue={selected?.quantity_total ?? 100}
              />
              <Field
                name="max_per_order"
                label={t.max_per_order}
                type="number"
                min="1"
                required
                defaultValue={selected?.max_per_order ?? 10}
              />
              {(["sales_start", "sales_end"] as const).map((key) => (
                <Field
                  name={key}
                  key={key}
                  label={t[key]}
                  type="datetime-local"
                  defaultValue={zonedInput(selected?.[key], event.timezone)}
                />
              ))}
            </div>
            <label className="checkbox-field">
              <input
                name="is_hidden"
                type="checkbox"
                defaultChecked={selected?.is_hidden ?? false}
              />
              {t.is_hidden}
            </label>
            <div className="controls">
              <button>{pending ? t.working : t.saveTicket}</button>
              <button
                type="button"
                className="secondary"
                onClick={() => select(undefined)}
              >
                {t.close}
              </button>
            </div>
          </fieldset>
        </form>
      )}
    </section>
  );
}
function RefundEditor({
  event,
  locale,
  locked,
}: {
  event: Event;
  locale: Locale;
  locked: boolean;
}) {
  const t = eventCopy[locale];
  const request = useEventRequest();
  const [error, setError] = useState<unknown>();
  const [pending, setPending] = useState(false);
  const [saved, setSaved] = useState(false);
  return (
    <section>
      <h2>{t.refund}</h2>
      <p>{t.policyGap}</p>
      <EventError error={error} t={t} />
      {saved && <Status>{t.policySaved}</Status>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (locked || pending) return;
          setError(undefined);
          setSaved(false);
          const form = new FormData(e.currentTarget);
          const summary = String(form.get("summary") ?? "").trim();
          let refundable_until: string | null = null;
          try {
            if (!summary) throw new InputError("summary");
            if (form.get("refundable_until"))
              refundable_until = toInstant(
                String(form.get("refundable_until")),
                event.timezone,
                "refundable_until",
              );
          } catch (err) {
            setError(err);
            return;
          }
          setPending(true);
          void request(`/api/v1/events/${event.id}/refund-policy`, {
            method: "PUT",
            body: { summary, refundable_until },
          })
            .then(() => setSaved(true))
            .catch(setError)
            .finally(() => setPending(false));
        }}
      >
        <fieldset disabled={locked || pending}>
          <TextArea name="summary" label={t.summary} required />
          <Field
            name="refundable_until"
            label={t.refundable_until}
            type="datetime-local"
          />
          <button>{pending ? t.working : t.savePolicy}</button>
        </fieldset>
      </form>
    </section>
  );
}
