import { useEffect, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { color, radius, raised, type } from "../theme";
import { Action, Body, Callout, Input, Label, Muted, Pill, Sheet, Title } from "../ui";
import { checkInCopy } from "./copy";
import { fromFailure, fromVerify, paths } from "./model";
import type { Attendee, AttendeePage, Outcome, VerifyOut } from "./model";
import { ResultCard } from "./Result";

const PAGE = 25;
const DEBOUNCE_MS = 350;

/**
 * Attendee lookup for people without a scannable code. Finding someone grants nothing:
 * admission only happens through the authorized /checkin/manual call after confirmation.
 */
export function AttendeeSearch({
  eventId,
  locale,
  visible,
  revision,
  onChanged,
  onUndo,
}: {
  eventId: string;
  locale: Locale;
  visible: boolean;
  /** Bumped by the parent after scans/undos so the list never shows stale status. */
  revision: number;
  onChanged: () => void;
  onUndo: (attendee: Attendee) => void;
}) {
  const t = checkInCopy[locale];
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<Attendee[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selected, setSelected] = useState<Attendee | null>(null);
  const request = useRef<AbortController | null>(null);

  async function load(offset: number) {
    if (!session) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setFailed(false);
    try {
      const page = await session.request<AttendeePage>(
        paths.attendees(eventId, query, offset, PAGE),
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setItems((current) =>
        offset === 0 ? page.items : [...current, ...page.items],
      );
      setTotal(page.total);
    } catch {
      if (!controller.signal.aborted) setFailed(true);
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => void load(0), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, visible, revision, eventId]);
  useEffect(() => () => request.current?.abort(), []);

  if (!visible) return null;

  return (
    <View style={local.wrap}>
      <Label nativeID="attendee-search-label">{t.searchLabel}</Label>
      <Input
        accessibilityLabel={t.searchLabel}
        accessibilityLabelledBy="attendee-search-label"
        accessibilityHint={t.searchHint}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        maxLength={100}
      />
      <Muted>{t.searchHint}</Muted>
      {failed ? (
        <>
          <Callout tone="danger" alert>
            {t.loadFailed}
          </Callout>
          <Action title={t.reload} variant="primary" onPress={() => void load(0)} />
        </>
      ) : null}
      {!loading && !failed && items.length === 0 ? (
        <Muted live="polite">{t.noResults}</Muted>
      ) : null}
      {items.map((attendee) => (
        <Pressable
          key={attendee.id}
          accessibilityRole="button"
          accessibilityLabel={`${attendee.full_name}, ${t.status[attendee.ticket_status] ?? attendee.ticket_status}`}
          onPress={() => setSelected(attendee)}
          style={({ pressed }) => [local.row, pressed && local.rowPressed]}
        >
          <View style={local.rowText}>
            <Text style={local.name}>{attendee.full_name}</Text>
            <Muted>{attendee.email}</Muted>
            <Muted>
              {attendee.ticket_type}
              {attendee.ticket_number ? ` · ${attendee.ticket_number}` : ""}
            </Muted>
          </View>
          <StatusPill
            status={attendee.ticket_status}
            label={t.status[attendee.ticket_status] ?? attendee.ticket_status}
          />
        </Pressable>
      ))}
      {loading ? <Muted live="polite">{t.loading}</Muted> : null}
      {!loading && items.length < total ? (
        <Action title={t.loadMore} onPress={() => void load(items.length)} />
      ) : null}
      <ManualSheet
        attendee={selected}
        eventId={eventId}
        locale={locale}
        onClose={() => setSelected(null)}
        onChanged={() => {
          onChanged();
          void load(0);
        }}
        onUndo={(attendee) => {
          setSelected(null);
          onUndo(attendee);
        }}
      />
    </View>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  return (
    <Pill
      label={label}
      tone={status === "checked_in" ? "success" : status === "valid" ? "neutral" : "danger"}
    />
  );
}

function ManualSheet({
  attendee,
  eventId,
  locale,
  onClose,
  onChanged,
  onUndo,
}: {
  attendee: Attendee | null;
  eventId: string;
  locale: Locale;
  onClose: () => void;
  onChanged: () => void;
  onUndo: (attendee: Attendee) => void;
}) {
  const t = checkInCopy[locale];
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  useEffect(() => setOutcome(null), [attendee?.id]);

  async function checkIn() {
    if (!session || !attendee?.ticket_id || busy) return;
    setBusy(true);
    const started = Date.now();
    try {
      const result = await session.request<VerifyOut>(paths.manual, {
        method: "POST",
        body: { event_id: eventId, ticket_id: attendee.ticket_id },
      });
      setOutcome(fromVerify(result, Date.now() - started));
      onChanged();
    } catch (failure) {
      // A refreshed session does not replay a POST; nothing was recorded, so ask again.
      const retryable =
        failure instanceof ApiError && failure.code === "request_not_replayed";
      setOutcome(
        retryable
          ? { kind: "error", ticket: null, message: null, latencyMs: null, code: failure.code }
          : fromFailure(failure, null, false),
      );
    } finally {
      setBusy(false);
    }
  }

  const canCheckIn = attendee?.ticket_status === "valid" && !!attendee.ticket_id;
  const canUndo = attendee?.ticket_status === "checked_in" && !!attendee.ticket_id;

  return (
    <Sheet visible={attendee !== null} onClose={onClose}>
      {attendee ? (
        <>
          <Title subtitle={attendee.email}>{attendee.full_name}</Title>
          <View style={local.ticket}>
            <Body>
              {attendee.ticket_type}
              {attendee.ticket_number ? ` · ${attendee.ticket_number}` : ""}
            </Body>
            <StatusPill
              status={attendee.ticket_status}
              label={t.status[attendee.ticket_status] ?? attendee.ticket_status}
            />
          </View>
          {outcome ? (
            <ResultCard outcome={outcome} locale={locale} />
          ) : canCheckIn ? (
            <>
              <Text style={local.name}>{t.manualTitle}</Text>
              <Muted>{t.manualExplain}</Muted>
              <Action
                title={t.manualConfirm}
                variant="primary"
                busy={busy}
                disabled={busy}
                onPress={() => void checkIn()}
              />
            </>
          ) : null}
          {!outcome && canUndo ? <Action title={t.undo} onPress={() => onUndo(attendee)} /> : null}
          <Action title={t.close} disabled={busy} onPress={onClose} />
        </>
      ) : null}
    </Sheet>
  );
}

const local = StyleSheet.create({
  wrap: { gap: 12 },
  row: {
    gap: 8,
    backgroundColor: color.surface,
    borderColor: color.line,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.card,
    padding: 16,
    ...raised,
  },
  rowPressed: { backgroundColor: color.canvas },
  rowText: { gap: 2 },
  name: { ...type.heading, fontSize: 17, color: color.ink },
  ticket: {
    gap: 8,
    backgroundColor: color.surface,
    borderColor: color.line,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.card,
    padding: 16,
  },
});
