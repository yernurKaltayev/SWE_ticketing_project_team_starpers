import { useState } from "react";
import type { Locale } from "@biletflow/shared";
import { parseEvent, parseTicketTypes } from "@biletflow/shared/features/events/contracts";
import type { Event, Ticket } from "@biletflow/shared/features/events/model";
import { seatingCopy } from "@biletflow/shared/features/seating/copy";
import { parseLayouts } from "@biletflow/shared/features/seating/model";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { Failure, Read, request, useResource } from "../features/resource";
import { useWrite } from "../features/use-write";
import { Select } from "../kit/Select";
import { Action, Card, Heading, Muted, Screen, Title } from "../ui";
import { eventRoot } from "./Events";

export function Seating({ id, locale }: { id: string; locale: Locale }) {
  const event = useResource(eventRoot(id), parseEvent);
  const t = seatingCopy[locale];
  return <Screen>
    <Title>{t.setup}</Title>
    <Read resource={event} locale={locale}>{(value) =>
      <Setup key={`${value.id}:${value.layout_id}:${value.seating_mode}`} event={value} locale={locale} refresh={() => void event.refetch()} />
    }</Read>
  </Screen>;
}

function Setup({ event, locale, refresh }: { event: Event; locale: Locale; refresh: () => void }) {
  const t = seatingCopy[locale];
  const path = eventRoot(event.id);
  const layouts = useResource(`/api/v1/venues/${encodeURIComponent(event.venue_id)}/layouts`, parseLayouts);
  const tickets = useResource(`${path}/ticket-types`, parseTicketTypes);
  const [mode, setMode] = useState(event.seating_mode);
  const [layout, setLayout] = useState(event.layout_id ?? "");
  const dirty = mode !== event.seating_mode || layout !== (event.layout_id ?? "");
  const discard = useDiscardChanges(dirty, locale);
  const write = useWrite(`seating:${event.id}`);
  const disabled = event.status !== "draft" || write.busy;
  return <>
    <Heading>{event.title}</Heading>
    <Muted>{t.draft}</Muted>
    <Select label={t.setup} locale={locale} value={mode} onChange={setMode} disabled={disabled}
      options={[{ value: "general_admission", label: t.general }, { value: "assigned", label: t.assigned }]} />
    {mode === "assigned" ? <Read resource={layouts} locale={locale}>{(data) => <>
      <Select label={t.layout} locale={locale} value={layout} onChange={setLayout} disabled={disabled}
        options={data.filter((value) => value.venue_id === event.venue_id).map((value) => ({ value: value.id, label: value.name }))} />
      {!data.length ? <Muted>{t.empty}</Muted> : null}
    </>}</Read> : null}
    <Failure error={write.error} locale={locale} />
    <Action title={t.save} variant="primary" busy={write.busy}
      disabled={disabled || !dirty || (mode === "assigned" && !layouts.data?.some((value) => value.id === layout))}
      onPress={() => void write.run(() => request(path, { method: "PATCH",
        body: { seating_mode: mode, layout_id: mode === "assigned" ? layout : null } }), true).then((result) => {
        if (result) refresh();
      })} />
    <Heading>{t.category}</Heading>
    <Read resource={tickets} locale={locale}>{(data) => data.items.map((ticket) =>
      <Category key={ticket.id} ticket={ticket} locale={locale} disabled={disabled} path={path} />)}</Read>
    {discard}
  </>;
}

function Category({ ticket, locale, disabled, path }: { ticket: Ticket; locale: Locale; disabled: boolean; path: string }) {
  const t = seatingCopy[locale];
  const [value, setValue] = useState(ticket.price_category ?? "");
  const [saved, setSaved] = useState(value);
  const write = useWrite(`seat-category:${ticket.id}`);
  const discard = useDiscardChanges(value !== saved, locale);
  return <Card>
    <AuthField label={ticket.name} value={value} onChangeText={setValue} editable={!disabled && !write.busy} maxLength={120} />
    <Action title={t.save} disabled={disabled || write.busy || value === saved} busy={write.busy}
      onPress={() => void write.run(async () => {
        await request(`${path}/ticket-types/${encodeURIComponent(ticket.id)}`, { method: "PATCH", body: { price_category: value.trim() || null } });
        setSaved(value);
      }, true)} />
    <Failure error={write.error} locale={locale} />
    {write.saved ? <Muted>{t.categorySaved}</Muted> : null}
    {discard}
  </Card>;
}
