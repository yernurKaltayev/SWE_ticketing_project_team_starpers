import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSessionSnapshot } from "../session";
import { formatEventRange, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { categoryLabel, knownCategories } from "@biletflow/shared/features/events/categories";
import { parseEvent, parseTicketTypes, parseVenue, parseVenues } from "@biletflow/shared/features/events/contracts";
import { eventCopy } from "@biletflow/shared/features/events/copy";
import { eventBody, findVenue, InputError, ticketBody, venueLabel, zonedInput } from "@biletflow/shared/features/events/model";
import type { Event, Ticket } from "@biletflow/shared/features/events/model";
import { seatingCopy } from "@biletflow/shared/features/seating/copy";
import { paymentCopy } from "@biletflow/shared/features/payments/copy";
import { staffCopy } from "@biletflow/shared/features/staff/copy";
import { promoCopy } from "@biletflow/shared/features/promotions/copy";
import { label } from "@biletflow/shared/features/insights/copy";
import { supportCopy } from "@biletflow/shared/features/support/copy";
import { allEvents, lifecycle, lifecycles } from "@biletflow/shared/features/insights/model";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { Read, Failure, request, useResource } from "../features/resource";
import { PageNav } from "../features/PageNav";
import { useWrite } from "../features/use-write";
import { ConfirmSheet } from "../kit/ConfirmSheet";
import { DateTimeField } from "../kit/DateTimeField";
import { ImageField } from "../kit/ImageField";
import { MoneyInput } from "../kit/MoneyInput";
import { Select } from "../kit/Select";
import { kitCopy } from "../kit/copy";
import { Action, Body, Callout, Card, Heading, Muted, Pill, Screen, Title } from "../ui";
import { webOrigin } from "../public-origin";

export type OrganizerProps = { locale: Locale; open: (path: string) => void };
export const eventRoot = (id: string) => `/api/v1/events/${encodeURIComponent(id)}`;
export const organizerEvent = (id: string, view: string) => `/organizer/events/${encodeURIComponent(id)}/${view}`;

export function OrganizerEvents({ locale, open }: OrganizerProps) {
  const t = eventCopy[locale];
  const [offset, setOffset] = useState(0);
  const [group, setGroup] = useState("");
  // Archive filters apply across all owned events, including past or cancelled ones.
  const resource = useOwnedEvents();
  return <Screen>
    <Title>{t.organizer}</Title>
    <Action title={t.create} variant="primary" onPress={() => open("/organizer/events/new")} />
    <Select label={label(locale, "archive")} locale={locale} value={group}
      options={["", ...lifecycles].map((value) => ({ value, label: label(locale, value || "all") }))}
      onChange={(value) => { setGroup(value); setOffset(0); }} />
    <Read resource={resource} locale={locale}>{(events) => {
      const filtered = events.filter((event) => !group || lifecycle(event) === group);
      const page = { offset, limit: 20, total: filtered.length, items: filtered.slice(offset, offset + 20) };
      return <>
        {page.items.length ? page.items.map((event) => <Card key={event.id}>
          <Heading>{event.title}</Heading>
          <Muted>{formatEventRange(event.starts_at, event.ends_at, event.timezone, locale)}</Muted>
          <Pill label={label(locale, event.status)} />
          <Action title={t.edit} onPress={() => open(organizerEvent(event.id, "edit"))} />
          <Action title={label(locale, "orders")} onPress={() => open(organizerEvent(event.id, "orders"))} />
          <Action title={label(locale, "history")} onPress={() => open(organizerEvent(event.id, "history"))} />
          <Duplicate id={event.id} locale={locale} open={open} />
        </Card>) : <Muted>{t.empty}</Muted>}
        <PageNav page={page} locale={locale} change={setOffset} />
      </>;
    }}</Read>
  </Screen>;
}

function useOwnedEvents() {
  const { user } = useSessionSnapshot();
  return useQuery({ queryKey: ["mobile-owned-events", user?.id], queryFn: ({ signal }) => allEvents(request, signal) });
}

const steps = ["details", "when", "tickets", "publish"] as const;
type Step = (typeof steps)[number];
const zones = ["Asia/Almaty", "Asia/Aqtobe", "Asia/Aqtau", "Asia/Atyrau", "Asia/Oral", "Asia/Qyzylorda", "UTC"];

export function EventEditor({ id, locale, open }: OrganizerProps & { id?: string }) {
  const resource = useResource(id ? eventRoot(id) : "", parseEvent);
  return <Screen>
    <Title>{id ? eventCopy[locale].edit : eventCopy[locale].create}</Title>
    {id ? <Read resource={resource} locale={locale}>{(event) =>
      <Editor key={event.id} event={event} locale={locale} open={open} />
    }</Read> : <Editor locale={locale} open={open} />}
  </Screen>;
}

function Editor({ event, locale, open }: OrganizerProps & { event?: Event }) {
  const t = eventCopy[locale];
  const [current, setCurrent] = useState(event);
  const { user } = useSessionSnapshot();
  const cache = useQueryClient();
  function saved(value: Event) {
    setCurrent(value);
    cache.setQueryData(["mobile", user?.id, eventRoot(value.id)], value);
    void cache.invalidateQueries({ queryKey: ["mobile-owned-events", user?.id] });
  }
  const [step, setStep] = useState<Step>("details");
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [category, setCategory] = useState(event?.category ?? "");
  const [visibility, setVisibility] = useState<string>(event?.visibility ?? "public");
  const [zone, setZone] = useState(event?.timezone ?? "Asia/Almaty");
  const [starts, setStarts] = useState<string | null>(event?.starts_at ?? null);
  const [ends, setEnds] = useState<string | null>(event?.ends_at ?? null);
  const [salesStart, setSalesStart] = useState<string | null>(event?.registration_opens_at ?? null);
  const [salesEnd, setSalesEnd] = useState<string | null>(event?.registration_closes_at ?? null);
  const [capacity, setCapacity] = useState(event ? String(event.capacity) : "");
  const [venueId, setVenueId] = useState(event?.venue_id ?? "");
  const [venueName, setVenueName] = useState("");
  const [venueAddress, setVenueAddress] = useState("");
  const [venueCity, setVenueCity] = useState("");
  const [dirty, setDirty] = useState(false);
  const [problem, setProblem] = useState("");
  const [confirm, setConfirm] = useState<"publish" | "unpublish" | null>(null);
  const venues = useResource("/api/v1/venues?limit=100&offset=0", parseVenues);
  const write = useWrite(`event-editor:${current?.id ?? "new"}`);
  const images = useWrite(`cover:${current?.id}`);
  const discard = useDiscardChanges(dirty, locale);
  const update = <T,>(set: (value: T) => void) => (value: T) => { set(value); setDirty(true); setProblem(""); };
  const path = current ? eventRoot(current.id) : "/api/v1/events";
  const source = current?.images[0];
  const cover = source?.startsWith("/") && webOrigin ? webOrigin + source : source ?? null;
  const currentZones = zone && !zones.includes(zone) ? [...zones, zone] : zones;
  const readOnly = current?.status === "cancelled";
  const blocked = write.busy || write.uncertain || readOnly;

  function save(move: Step) {
    const match = venueId === "new"
      ? findVenue(venues.data?.items ?? [], `${venueName.trim()} · ${venueCity.trim()} · ${venueAddress.trim()}`)
      : undefined;
    let body: ReturnType<typeof eventBody>;
    try {
      if (venueId === "new" && ![venueName, venueCity, venueAddress].every((value) => value.trim())) {
        throw new InputError("venue_new_name");
      }
      const values: Record<string, string> = {
        title, description, category, visibility, timezone: zone, capacity, venue_id: match?.id ?? venueId,
        starts_at: starts ? zonedInput(starts, zone) : "",
        ends_at: ends ? zonedInput(ends, zone) : "",
        registration_opens_at: salesStart ? zonedInput(salesStart, zone) : "",
        registration_closes_at: salesEnd ? zonedInput(salesEnd, zone) : "",
      };
      body = eventBody({ get: (key) => values[key] ?? null });
    } catch (error) {
      const field = error instanceof InputError ? t[error.field as keyof typeof t] : undefined;
      setProblem([field, t.invalid].filter(Boolean).join(" · "));
      return;
    }
    void write.run(async () => {
      if (venueId === "new" && !match) {
        const venue = parseVenue(await request("/api/v1/venues", { method: "POST", body: {
          name: venueName.trim(), address: venueAddress.trim(), city: venueCity.trim(),
        } }));
        setVenueId(venue.id);
        void venues.refetch();
        body.venue_id = venue.id;
      }
      if (current) {
        body.seating_mode = current.seating_mode;
        body.layout_id = current.layout_id ?? null;
      }
      return parseEvent(await request(path, { method: current ? "PATCH" : "POST", body }));
    }, Boolean(current) && !(venueId === "new" && !match)).then((result) => {
      if (!result) return;
      saved(result);
      setDirty(false);
      setStep(move);
    });
  }

  return <>
    {current ? <Pill label={label(locale, current.status)} /> : null}
    <Heading>{t[step]}</Heading>
    {problem ? <Callout tone="warning" alert>{problem}</Callout> : null}
    <Failure error={write.error ?? images.error} locale={locale} />
    {write.uncertain || images.uncertain ? <Callout tone="warning">{label(locale, "unknown")}</Callout> : null}
    {write.uncertain ? <Action title={supportCopy[locale].checked} onPress={write.clearUncertain} /> : null}
    {images.uncertain ? <Action title={supportCopy[locale].checked} onPress={images.clearUncertain} /> : null}
    {step === "details" ? <>
      <AuthField label={t.title} value={title} onChangeText={update(setTitle)} editable={!blocked} maxLength={200} />
      <AuthField label={t.description} value={description} onChangeText={update(setDescription)} editable={!blocked} multiline maxLength={10000} />
      <Select label={t.category} locale={locale} value={category} disabled={blocked}
        options={[...new Set([category, ...knownCategories].filter(Boolean))].map((value) => ({ value, label: categoryLabel(value, locale) }))}
        onChange={update(setCategory)} />
      <Select label={t.visibility} locale={locale} value={visibility} onChange={update(setVisibility)} disabled={blocked}
        options={["public", "unlisted", "private"].map((value) => ({ value, label: t[value as "public" | "unlisted" | "private"] }))} />
      <Action title={t.next} onPress={() => setStep("when")} />
    </> : null}
    {step === "when" ? <>
      <Select label={t.timezone} locale={locale} value={zone} onChange={update(setZone)} disabled={blocked}
        options={currentZones.map((value) => ({ value, label: value }))} />
      <DateTimeField label={t.starts_at} locale={locale} zone={zone} value={starts} onChange={update(setStarts)} />
      <DateTimeField label={t.ends_at} locale={locale} zone={zone} value={ends} onChange={update(setEnds)} />
      <DateTimeField label={t.registration_opens_at} locale={locale} zone={zone} value={salesStart} onChange={update(setSalesStart)} />
      <DateTimeField label={t.registration_closes_at} locale={locale} zone={zone} value={salesEnd} onChange={update(setSalesEnd)} />
      <AuthField label={t.capacity} value={capacity} inputMode="numeric" onChangeText={update(setCapacity)} editable={!blocked} />
      <Failure error={venues.error} locale={locale} retry={() => void venues.refetch()} />
      <Select label={t.venue_id} locale={locale} value={venueId} onChange={update(setVenueId)} disabled={blocked}
        options={[...(venues.data?.items ?? []).map((value) => ({ value: value.id, label: venueLabel(value) })),
          { value: "new", label: t.venueAdd }]} />
      {venueId === "new" ? <>
        <AuthField label={t.venue_new_name} value={venueName} onChangeText={update(setVenueName)} editable={!blocked} />
        <AuthField label={t.venue_address} value={venueAddress} onChangeText={update(setVenueAddress)} editable={!blocked} />
        <AuthField label={t.venue_city} value={venueCity} onChangeText={update(setVenueCity)} editable={!blocked} />
      </> : null}
      <Action title={t.previous} onPress={() => setStep("details")} />
      <Action title={t.save} variant="primary" busy={write.busy} disabled={blocked} onPress={() => save("tickets")} />
      {current && !dirty ? <Action title={t.next} onPress={() => setStep("tickets")} /> : null}
    </> : null}
    {current && step === "tickets" ? <>
      <Tickets id={current.id} locale={locale} disabled={readOnly} />
      <Action title={t.previous} onPress={() => setStep("when")} />
      <Action title={t.next} onPress={() => setStep("publish")} />
    </> : null}
    {current && step === "publish" ? <>
      <ImageField label={t.cover} locale={locale} imageUri={cover} busy={images.busy || images.uncertain || readOnly}
        onPick={(file) => void images.run(async () => {
          const form = new FormData();
          form.append("file", file as unknown as Blob);
          const result = await request(`${path}/images`, { method: "POST", body: form });
          return parseEvent(result);
        }).then((result) => { if (result) saved(result); })}
        onRemove={() => void images.run(async () => parseEvent(await request(`${path}/images`, { method: "DELETE" })))
          .then((result) => { if (result) saved(result); })} />
      <Action title={t.preview} onPress={() => open(organizerEvent(current.id, "preview"))} />
      {!readOnly ? <>
        <Action title={current.status === "draft" ? t.publish : t.unpublish} variant="primary" disabled={blocked}
          onPress={() => setConfirm(current.status === "draft" ? "publish" : "unpublish")} />
        <Action title={t.cancel} disabled={blocked} onPress={() => open(organizerEvent(current.id, "orders"))} />
      </> : null}
      <RefundPolicy event={current} locale={locale} disabled={readOnly} />
      <Duplicate id={current.id} locale={locale} open={open} />
      <Action title={t.previous} onPress={() => setStep("tickets")} />
    </> : null}
    {current ? <EventLinks id={current.id} locale={locale} open={open} /> : null}
    <ConfirmSheet visible={Boolean(confirm)} title={t.confirmTitle}
      body={confirm === "publish" ? t.publishHint : t.unpublishHint}
      confirmLabel={t.confirm} cancelLabel={kitCopy[locale].cancel} busy={write.busy}
      onCancel={() => setConfirm(null)} onConfirm={() => {
        if (!confirm) return;
        void write.run(async () => parseEvent(await request(`${path}/${confirm}`, { method: "POST" })), true).then((result) => {
          if (result) saved(result);
          setConfirm(null);
        });
      }} />
    {discard}
  </>;
}

function EventLinks({ id, locale, open }: OrganizerProps & { id: string }) {
  const links = ["seating", "staff", "promotions", "orders", "activation", "financials", "analytics", "history"] as const;
  const names = { seating: seatingCopy[locale].setup, staff: staffCopy[locale].title, promotions: promoCopy[locale].title,
    orders: label(locale, "orders"), activation: paymentCopy[locale].activation, financials: paymentCopy[locale].eventFinances,
    analytics: label(locale, "analytics"), history: label(locale, "history") };
  return <Card>{links.map((entry) => <Action key={entry} title={names[entry]} onPress={() => open(organizerEvent(id, entry))} />)}</Card>;
}

function Duplicate({ id, locale, open }: OrganizerProps & { id: string }) {
  const [confirm, setConfirm] = useState(false);
  const t = eventCopy[locale];
  const write = useWrite(`duplicate:${id}`);
  return <>
    <Action title={t.duplicate} onPress={() => setConfirm(true)} disabled={write.uncertain} />
    {write.uncertain ? <Action title={supportCopy[locale].checked} onPress={write.clearUncertain} /> : null}
    <Failure error={write.error} locale={locale} />
    {write.uncertain ? <Muted>{label(locale, "unknown")}</Muted> : null}
    <ConfirmSheet visible={confirm} title={t.duplicate} confirmLabel={t.confirm} cancelLabel={kitCopy[locale].cancel}
      busy={write.busy} onCancel={() => setConfirm(false)} onConfirm={() => void write.run(async () =>
        parseEvent(await request(`${eventRoot(id)}/duplicate`, { method: "POST" }))).then((result) => {
          setConfirm(false);
          if (result && result.id !== id) open(organizerEvent(result.id, "edit"));
        })} />
  </>;
}

function Tickets({ id, locale, disabled }: { id: string; locale: Locale; disabled?: boolean }) {
  const t = eventCopy[locale];
  const path = `${eventRoot(id)}/ticket-types`;
  const items = useResource(path, parseTicketTypes);
  const [editing, setEditing] = useState<Ticket | "new" | null>(null);
  return <>
    <Read resource={items} locale={locale}>{(page) => page.items.map((ticket) => <Card key={ticket.id}>
      <Heading>{ticket.name}</Heading>
      <Body>{formatPrice(Number(ticket.price_amount), locale)}</Body>
      <Muted>{t.capacity} {ticket.quantity_total}</Muted>
      <Action title={t.editTicket} disabled={disabled} onPress={() => setEditing(ticket)} />
    </Card>)}</Read>
    {editing ? <TicketForm key={editing === "new" ? "new" : editing.id} ticket={editing === "new" ? undefined : editing}
      locale={locale} path={path} done={() => { setEditing(null); void items.refetch(); }} /> : null}
    {!editing ? <Action title={t.addTicket} disabled={disabled} onPress={() => setEditing("new")} /> : null}
  </>;
}

function TicketForm({ ticket, path, locale, done }: { ticket?: Ticket; path: string; locale: Locale; done: () => void }) {
  const t = eventCopy[locale];
  const [name, setName] = useState(ticket?.name ?? "");
  const [description, setDescription] = useState(ticket?.description ?? "");
  const [price, setPrice] = useState<number | null>(ticket ? Number(ticket.price_amount) : 0);
  const [quantity, setQuantity] = useState(ticket ? String(ticket.quantity_total) : "");
  const [limit, setLimit] = useState(ticket ? String(ticket.max_per_order) : "10");
  const [hidden, setHidden] = useState(Boolean(ticket?.is_hidden));
  const [error, setError] = useState(false);
  const write = useWrite(`ticket:${path}:${ticket?.id ?? "new"}`);
  const discard = useDiscardChanges(Boolean(name || description || quantity) && !write.saved, locale);
  return <Card>
    <Heading>{ticket ? t.editTicket : t.addTicket}</Heading>
    <AuthField label={t.name} value={name} onChangeText={setName} maxLength={200} />
    <AuthField label={t.ticket_description} value={description} onChangeText={setDescription} multiline />
    <MoneyInput label={t.price} amount={price} onChange={setPrice} locale={locale} />
    <AuthField label={t.quantity_total} value={quantity} onChangeText={setQuantity} inputMode="numeric" />
    <AuthField label={t.max_per_order} value={limit} onChangeText={setLimit} inputMode="numeric" />
    <Action title={t.is_hidden} variant={hidden ? "primary" : "secondary"} onPress={() => setHidden(!hidden)} />
    {error ? <Muted>{t.invalid}</Muted> : null}
    <Failure error={write.error} locale={locale} />
    {write.uncertain ? <Muted>{label(locale, "unknown")}</Muted> : null}
    {write.uncertain ? <Action title={supportCopy[locale].checked} onPress={write.clearUncertain} /> : null}
    <Action title={t.saveTicket} variant="primary" busy={write.busy} disabled={write.busy || write.uncertain}
      onPress={() => {
        if (price === null) { setError(true); return; }
        const values: Record<string, string> = { name, ticket_description: description, price: (price / 100).toFixed(2),
          quantity_total: quantity, max_per_order: limit };
        let body: ReturnType<typeof ticketBody>;
        try { body = ticketBody({ get: (key) => values[key] ?? null, has: (key) => key === "is_hidden" && hidden }); }
        catch { setError(true); return; }
        setError(false);
        if (ticket) body.price_category = ticket.price_category ?? null;
        void write.run(() => request(ticket ? `${path}/${encodeURIComponent(ticket.id)}` : path, {
          method: ticket ? "PATCH" : "POST", body,
        }), Boolean(ticket)).then((result) => { if (result) done(); });
      }} />
    <Action title={t.close} onPress={done} disabled={write.busy} />
    {discard}
  </Card>;
}


function RefundPolicy({ event, locale, disabled }: { event: Event; locale: Locale; disabled: boolean }) {
  const t = eventCopy[locale];
  const [summary, setSummary] = useState(event.refund_policy?.summary ?? "");
  const [until, setUntil] = useState(event.refund_policy?.refundable_until ?? null);
  const write = useWrite(`refund-policy:${event.id}`);
  return <Card>
    <Heading>{t.refund}</Heading>
    <AuthField label={t.summary} value={summary} onChangeText={setSummary} maxLength={2000} multiline editable={!disabled && !write.busy} />
    <DateTimeField label={t.refundable_until} zone={event.timezone} value={until} onChange={setUntil} locale={locale} />
    <Action title={t.saveChanges} disabled={disabled || !summary.trim() || write.busy} busy={write.busy}
      onPress={() => void write.run(() => request(`${eventRoot(event.id)}/refund-policy`, {
        method: "PUT", body: { summary: summary.trim(), refundable_until: until },
      }), true)} />
    <Failure error={write.error} locale={locale} />
    {write.saved ? <Muted>{t.saved}</Muted> : null}
  </Card>;
}
