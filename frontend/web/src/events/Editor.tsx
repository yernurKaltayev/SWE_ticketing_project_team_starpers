import { DuplicateEvent } from "../insights/DuplicateEvent";
import { CoverEditor } from "./CoverEditor";
import { noFinalDot } from "../auth/helpers";
import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field, Status } from "../auth/ui";
import { useSession } from "../auth/session";
import { eventCopy } from "./copy";
import { categoryLabel, knownCategories } from "./categories";

import { toneFor } from "../tone";
import { useEventRequest, useResource } from "./data";
import {
  eventBody,
  findVenue,
  InputError,
  venueLabel,
  ticketBody,
  toInstant,
  zonedInput,
  priceInput,
} from "./model";
import type { Event, Page, Ticket, Venue } from "./model";
import { EventError, SelectField, TextArea } from "./ui";
import { ArrowLeftIcon } from "../icons";
import { cityLabel, knownCities } from "./venues";
import {
  parseEvent,
  parseVenue,
  parseVenues,
  parseTicketTypes,
} from "./contracts";

// Select value for "add a new venue"; never a real venue id.
const NEW_VENUE = "__new__";

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
  // An admin editing someone else's event: organizer-only pages and actions are hidden.
  const admin = user?.role === "platform_admin";
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
  // A saved venue's id, NEW_VENUE while the organizer fills in a venue of their own, or "".
  const [venueChoice, setVenueChoice] = useState<string>(initial?.venue_id ?? "");
  const newVenue = venueChoice === NEW_VENUE;
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
    kind: "publish" | "unpublish" | "cancel",
  ) {
    if (!event || pending || dirty) return;
    setPending(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = parseEvent(
        await request(`/api/v1/events/${event.id}/${kind}`, { method: "POST" }),
      );
      setEvent(result);
      setRevision((n) => n + 1);
      setAction(null);
      setSaved(true);
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
      <Link className="back-link" to={admin ? "/admin/events" : "/organizer/events"}>
        <ArrowLeftIcon size={16} />
        {t.back}
      </Link>
      {/* Orders, staff, promotions, seating and support for this event are in
          the sidebar; only the title and state belong here. */}
      <div className="title-row">
        <h1>{event ? t.edit : t.create}</h1>
        {event && (
          <span className="status-badge" data-tone={toneFor(event.status)}>
            {t[event.status as "draft"] ?? event.status}
          </span>
        )}
      </div>
      <EventError error={error} t={t} />
      {saved && <Status>{t.saved}</Status>}
      <EventError
        error={moreVenues.error}
        t={t}
        retry={() => {
          moreVenues.reload();
        }}
      />
      {event?.seating_mode === "assigned" && <Status>{t.assignedHint}</Status>}
      <form
        className="panel editor-form"
        noValidate
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
          let body: ReturnType<typeof eventBody>;
          let venueToCreate: { name: string; address: string; city: string } | null =
            null;
          try {
            // Fields above the venue are checked first, so the first error matches the form order.
            if (newVenue) eventBody({ get: (key) => (key === "venue_id" ? "new" : form.get(key)) });
            if (newVenue) {
              const text = (key: string) => String(form.get(key) ?? "").trim();
              const name = text("venue_new_name");
              const address = text("venue_address");
              const city = text("venue_city");
              if (!name) throw new InputError("venue_new_name");
              if (!address) throw new InputError("venue_address");
              if (!city) throw new InputError("venue_city");
              // The same hall already in the list is reused instead of sending a copy.
              const match = findVenue(venueOptions, `${name} · ${city} · ${address}`);
              if (match) form.set("venue_id", match.id);
              else {
                venueToCreate = { name, address, city };
                // Placeholder until the venue exists; replaced below before the event is sent.
                form.set("venue_id", "new");
              }
            }
            body = eventBody(form);
          } catch (err) {
            setError(err);
            return;
          }
          setPending(true);
          // The event is checked first, so an invalid form never leaves a stray venue behind.
          void (
            venueToCreate
              ? request("/api/v1/venues", { method: "POST", body: venueToCreate })
                  .then(parseVenue)
                  .then((venue) => {
                    setVenueOptions((old) =>
                      old.some((v) => v.id === venue.id) ? old : [...old, venue],
                    );
                    setVenueChoice(venue.id);
                    return venue.id;
                  })
              : Promise.resolve(body.venue_id)
          )
            .then((venue_id) =>
              request(event ? `/api/v1/events/${event.id}` : "/api/v1/events", {
                method: event ? "PATCH" : "POST",
                body: { ...body, venue_id },
              }),
            )
            .then(parseEvent)
            .then((result) => {
              // On create, let the destination route load the saved event before
              // showing its edit controls. Publishing local edit state first can
              // flash an editor that disappears when navigation starts loading.
              if (!event) {
                navigate(`/organizer/events/${result.id}/edit`, {
                  replace: true,
                });
                return;
              }
              setDirty(false);
              setEvent(result);
              setRevision((n) => n + 1);
              setSaved(true);
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
            <div className="field">
              <label htmlFor="category">{t.category}</label>
              <select
                id="category"
                name="category"
                defaultValue={event?.category?.trim().toLowerCase() || "concert"}
                required
              >
                {event?.category &&
                  !(knownCategories as string[]).includes(event.category.trim().toLowerCase()) && (
                    <option value={event.category.trim().toLowerCase()}>{event.category}</option>
                  )}
                {knownCategories.map((key) => (
                  <option key={key} value={key}>
                    {categoryLabel(key, locale)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="venue_id">{t.venue_id}</label>
              <select
                id="venue_id"
                name="venue_id"
                required
                value={venueChoice}
                onChange={(e) => setVenueChoice(e.target.value)}
              >
                <option value="">{t.venuePick}</option>
                {venueOptions.map((venue) => (
                  <option key={venue.id} value={venue.id}>
                    {venueLabel(venue)}
                  </option>
                ))}
                <option value={NEW_VENUE}>{t.venueAdd}</option>
              </select>
            </div>
          </div>
          {newVenue && (
            <p className="field-hint" role="status">
              {t.venueNew}
            </p>
          )}
          {newVenue && (
            <div className="event-form-grid">
              <Field
                name="venue_new_name"
                label={t.venue_new_name}
                maxLength={200}
                required
              />
              <Field
                name="venue_address"
                label={t.venue_address}
                maxLength={300}
                required
              />
              <SelectField name="venue_city" label={t.venue_city} required>
                <option value="" disabled>
                  {t.chooseCity}
                </option>
                {[...knownCities]
                  .sort((a, b) =>
                    cityLabel(a, locale).localeCompare(cityLabel(b, locale)),
                  )
                  .map((city) => (
                    <option key={city} value={city}>
                      {cityLabel(city, locale)}
                    </option>
                  ))}
              </SelectField>
            </div>
          )}
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
                hint={
                  key === "registration_closes_at" ? t.salesCloseHint : undefined
                }
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
          {/* Every event is in Kazakhstan (one zone since 2024); existing events keep theirs. */}
          <input type="hidden" name="timezone" defaultValue={zone} />
          <button>{pending ? t.working : event ? t.saveChanges : t.save}</button>
        </fieldset>
      </form>
      {dirty && <Status>{t.dirty}</Status>}
      {event && (
        <>
          <div className="controls">
            {!dirty && (
              <Link
                className="action-link ghost"
                to={admin ? `/events/${event.id}` : `/organizer/events/${event.id}/preview`}
              >
                {t.preview}
              </Link>
            )}
            {event.status !== "cancelled" && (
              <button
                ref={actionButton}
                className={event.status === "published" ? "secondary" : undefined}
                disabled={pending || dirty || !user?.email_verified_at}
                onClick={() =>
                  setAction(
                    event.status === "published" ? "unpublish" : "publish",
                  )
                }
              >
                {event.status === "published" ? t.unpublish : t.publish}
              </button>
            )}
            {!admin && (
              <DuplicateEvent
                id={event.id}
                title={event.title}
                locale={locale}
                disabled={pending || dirty}
              />
            )}
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
            <h2 id="publication-title">
              {action ? `${t[action]}?` : t.confirmTitle}
            </h2>
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
                className={action === "cancel" ? "danger" : undefined}
                onClick={() => action && void mutate(action)}
              >
                {pending ? t.working : action ? t[action] : t.confirm}
              </button>
            </div>
          </dialog>
          <CoverEditor
            event={event}
            locale={locale}
            locked={pending || event.status === "cancelled"}
            onChange={setEvent}
          />
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
          {event.status !== "cancelled" && !admin && (
            // Kept apart from publish/duplicate so a slip cannot cancel an event.
            <section className="danger-zone" aria-labelledby="danger-title">
              <h2 id="danger-title">{t.dangerZone}</h2>
              <p>{t.cancelHint}</p>
              <button
                className="danger"
                disabled={pending || dirty}
                onClick={() => navigate(`/organizer/events/${event.id}/orders`)}
              >
                {t.cancel}
              </button>
            </section>
          )}
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
      {/* Four columns fit a laptop without sideways scrolling; reserved, refunded
          and checked-in counts live on the analytics page. */}
      {!!tickets.data?.items.length && (
      <div className="table-scroll">
        <table className="ticket-table">
          <caption className="visually-hidden">{t.tickets}</caption>
          <thead>
            <tr>
              <th scope="col">{t.ticketColumn}</th>
              <th scope="col">{t.priceColumn}</th>
              <th scope="col">{t.sold}</th>
              <th scope="col">{t.available}</th>
              <th scope="col">
                <span className="visually-hidden">{t.editTicket}</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {tickets.data.items.map((ticket) => (
              <tr key={ticket.id}>
                <th scope="row">
                  {ticket.name}
                  {ticket.is_hidden && (
                    <span className="status-badge" data-tone="neutral">
                      {t.hiddenBadge}
                    </span>
                  )}
                </th>
                <td>{formatPrice(ticket.price_amount ?? 0, locale)}</td>
                <td>
                  {ticket.sold} / {ticket.quantity_total}
                </td>
                <td>{ticket.available}</td>
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
      )}
      {tickets.data && (offset > 0 || tickets.data.total > tickets.data.limit) && (
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
          className="panel editor-form"
          noValidate
          key={selected?.id ?? "new"}
          onSubmit={(e) => {
            e.preventDefault();
            if (locked || pending) return;
            setError(undefined);
            let body;
            try {
              body = ticketBody(new FormData(e.currentTarget));
            } catch (err) {
              setError(err);
              return;
            }
            setPending(true);
            void request<Ticket>(
              `/api/v1/events/${event.id}/ticket-types${selected ? `/${selected.id}` : ""}`,
              {
                method: selected ? "PATCH" : "POST",
                body: selected
                  ? Object.fromEntries(
                      Object.entries(body).filter(
                        ([key]) => key !== "price_category",
                      ),
                    )
                  : body,
              },
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
      {!event.refund_policy && !saved && (
        <p className="field-hint">{noFinalDot(t.policyEmpty)}</p>
      )}
      <EventError error={error} t={t} />
      {saved && <Status>{t.policySaved}</Status>}
      <form
        className="panel editor-form"
        noValidate
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
          <TextArea
            name="summary"
            label={t.summary}
            value={event.refund_policy?.summary}
            required
          />
          <Field
            name="refundable_until"
            label={t.refundable_until}
            type="datetime-local"
            defaultValue={zonedInput(
              event.refund_policy?.refundable_until ?? undefined,
              event.timezone,
            )}
          />
          <button>{pending ? t.working : t.savePolicy}</button>
        </fieldset>
      </form>
    </section>
  );
}
