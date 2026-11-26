import { Image } from "react-native";
import { ApiError, formatEventDateTime, formatEventRange, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { calendarCopy } from "@biletflow/shared/features/calendar/copy";
import { calendarFileName, calendarFilePath, calendarMode } from "@biletflow/shared/features/calendar/model";
import { categoryLabel } from "@biletflow/shared/features/events/categories";
import { parseEvent, parsePublicAvailability, parseVenue } from "@biletflow/shared/features/events/contracts";
import { eventCopy } from "@biletflow/shared/features/events/copy";
import { offerSummary, salesState } from "@biletflow/shared/features/events/model";
import { offerLabel } from "@biletflow/shared/features/events/offerLabel";
import { label } from "@biletflow/shared/features/insights/copy";
import { parseRow } from "@biletflow/shared/features/insights/model";
import { checkoutLink } from "@biletflow/shared/features/promotions/model";
import { seatingCopy } from "@biletflow/shared/features/seating/copy";
import { supportLink } from "@biletflow/shared/features/support/model";
import { useEffect, useRef, useState } from "react";
import { Failure, Read, request, useResource } from "../features/resource";
import { useWrite } from "../features/use-write";
import { downloadAndShare } from "../files";
import { Action, Body, Callout, Card, Heading, Input, Muted, Pill, Screen, Title } from "../ui";
import { useSessionSnapshot } from "../session";
import { webOrigin } from "../public-origin";

type Props = { id: string; locale: Locale; search: string; open: (path: string) => void; preview?: boolean };
export function EventDetail({ id, locale, search, open, preview }: Props) {
  const base = `/api/v1/events/${encodeURIComponent(id)}`;
  const event = useResource(base, parseEvent);
  const venue = useResource(event.data ? `/api/v1/venues/${encodeURIComponent(event.data.venue_id)}` : "", parseVenue);
  const tickets = useResource(`${base}/availability`, parsePublicAvailability);
  const t = eventCopy[locale];
  const c = calendarCopy[locale];
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const flight = useRef<AbortController | null>(null);
  useEffect(() => () => flight.current?.abort(), []);

  return (
    <Screen>
      <Read resource={event} locale={locale}>
        {(data) => {
          const mode = calendarMode(data);
          const offer = tickets.data && offerSummary(tickets.data);
          return (
            <>
              <Title>{data.title}</Title>
              {preview ? <Callout tone="info">{t.previewHint}</Callout> : null}
              {data.category ? <Pill label={categoryLabel(data.category, locale)} /> : null}
              {data.status !== "published" ? <Pill label={data.status === "cancelled" ? t.cancelled : t.draft} /> : null}
              {data.images.map((src, index) => (
                <Image key={`${src}:${index}`} source={{ uri: src.startsWith("/") && webOrigin ? webOrigin + src : src }}
                  style={{ width: "100%", aspectRatio: 1.7, borderRadius: 12 }} />
              ))}
              <Card>
                <Heading>{t.when}</Heading>
                <Body>{formatEventRange(data.starts_at, data.ends_at, data.timezone, locale)}</Body>
                <Read resource={venue} locale={locale}>
                  {(place) => <Muted>{[place.name, place.address, place.city].filter(Boolean).join(" · ")}</Muted>}
                </Read>
                {data.status !== "cancelled" ? (
                  <>
                    <Heading>{t.salesWindow}</Heading>
                    {data.registration_opens_at ? <Muted>{t.salesOpens}: {formatEventDateTime(data.registration_opens_at, data.timezone, locale)}</Muted> : null}
                    <Muted>{t.salesCloses}: {formatEventDateTime(data.registration_closes_at ?? data.starts_at, data.timezone, locale)}</Muted>
                  </>
                ) : null}
              </Card>
              {data.description ? <Card><Heading>{t.description}</Heading><Body>{data.description}</Body></Card> : null}
              {data.refund_policy?.summary ? <Card>
                <Heading>{t.refund}</Heading>
                <Body>{data.refund_policy.summary}</Body>
                {data.refund_policy.refundable_until ? <Muted>{t.refundable_until} {formatEventDateTime(data.refund_policy.refundable_until, data.timezone, locale)}</Muted> : null}
              </Card> : null}
              <Heading>{t.tickets}</Heading>
              <Read resource={tickets} locale={locale}>{(items) => items.length ? items.map((item) => (
                <Card key={item.ticket_type_id}>
                  <Heading>{item.name}</Heading>
                  <Body>{item.price_amount ? formatPrice(item.price_amount, locale) : t.free}</Body>
                  <Pill label={t[salesState(data, item)]} />
                  <Muted>{t.available} {item.available}</Muted>
                </Card>
              )) : <Muted>{t.ticketEmpty}</Muted>}</Read>
              {!preview && data.status === "published" ? <>
                {offer ? <Body>{offerLabel(offer, locale)}</Body> : null}
                <Action title={t.tickets} variant="primary" onPress={() => open(checkoutLink(id, search))} />
                {data.seating_mode === "assigned" ? <Action title={seatingCopy[locale].title}
                  onPress={() => open(`/events/${encodeURIComponent(id)}/seats${search}`)} /> : null}
              </> : null}
              {!preview && mode ? (
                <Card>
                  <Heading>{c.title}</Heading>
                  {mode === "cancelled" ? <Muted>{c.cancelled}</Muted> : null}
                  <Action title={sharing ? c.working : mode === "cancelled" ? c.downloadUpdated : c.download}
                    disabled={sharing} busy={sharing} onPress={() => {
                      if (flight.current) return;
                      const controller = new AbortController();
                      flight.current = controller;
                      setSharing(true);
                      setCalendarError(null);
                      void downloadAndShare(calendarFilePath(data), calendarFileName(data).replace(/\.ics$/, ""), "ics",
                        controller.signal, true).then((result) => {
                          if (result === "unavailable") setCalendarError(c.unavailable);
                        }).catch((error: unknown) => setCalendarError(error instanceof ApiError && error.status === 0
                          ? c.network : c.error)).finally(() => {
                          flight.current = null;
                          setSharing(false);
                        });
                    }} />
                  {calendarError ? <Callout alert tone="danger">{calendarError}</Callout> : null}
                </Card>
              ) : null}
              {!preview ? <Action title={t.helpSupport} onPress={() => open(supportLink({ event_id: id }))} /> : null}
              {!preview && data.status === "published" && data.visibility !== "private" ? <Report id={id} locale={locale} open={open} /> : null}
            </>
          );
        }}
      </Read>
    </Screen>
  );
}

function Report({ id, locale, open }: Pick<Props, "id" | "locale" | "open">) {
  const { user } = useSessionSnapshot();
  const t = (key: string) => label(locale, key);
  const [expanded, setExpanded] = useState(false);
  const [reason, setReason] = useState("");
  const write = useWrite(`report:${id}`);
  return (
    <Card>
      <Action title={t("report")} onPress={() => setExpanded(!expanded)} />
      {expanded && <>
        <Muted>{t("reportHint")}</Muted>
        {user ? <>
          <Input accessibilityLabel={t("reason")} multiline value={reason} maxLength={2000} onChangeText={setReason}
            editable={!write.busy && !write.saved && !write.uncertain} />
          <Action title={write.busy ? t("working") : t("report")} disabled={write.busy || !reason.trim() || write.saved || write.uncertain}
            onPress={() => void write.run(async () => {
              const report = parseRow("reports", await request(`/api/v1/events/${encodeURIComponent(id)}/reports`, {
                method: "POST", body: { reason: reason.trim() },
              }));
              if (report.event_id !== id) throw new Error("invalid report");
              setReason("");
            })} />
        </> : <Action title={authCopy[locale].login} onPress={() => open(`/login?returnTo=${encodeURIComponent(`/events/${id}`)}`)} />}
        <Failure error={write.error} locale={locale} />
        {write.saved ? <Muted>{t("saved")}</Muted> : null}
        {write.uncertain ? <Callout tone="warning">{t("unknown")}</Callout> : null}
      </>}
    </Card>
  );
}
