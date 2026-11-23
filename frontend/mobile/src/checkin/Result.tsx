import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { checkInCopy } from "./copy";
import { paths, UNDO_REASON_MAX, validUndoReason } from "./model";
import type { Outcome, OutcomeKind, Ticket } from "./model";
import { VerdictIcon } from "../icons";
import type { Glyph } from "../icons";
import { color, feedback, radius, type, verdictFeedback } from "../theme";
import { Action, Body, Callout, Card, Input, Label, Muted, Sheet, Title } from "../ui";

function glyphOf(kind: OutcomeKind): Glyph {
  if (kind === "accepted") return "check";
  if (kind === "unknown" || kind === "error") return "question";
  if (kind === "already_used" || kind === "wrong_event") return "alert";
  return "cross";
}

export function TicketFacts({
  ticket,
  locale,
  labelColor = color.muted,
}: {
  ticket: Ticket;
  locale: Locale;
  /** On a tinted verdict panel, labels take the panel's hue rather than grey. */
  labelColor?: string;
}) {
  const t = checkInCopy[locale];
  const rows: [string, string][] = [
    [t.attendee, ticket.attendee_name],
    [t.ticketType, ticket.ticket_type],
    [t.ticketNumber, ticket.ticket_number],
  ];
  if (ticket.seat)
    rows.push([
      t.seat,
      `${t.section} ${ticket.seat.section_name} · ${t.row} ${ticket.seat.row_label} · ${ticket.seat.seat_number}`,
    ]);
  return (
    <View style={local.facts}>
      {rows.map(([label, value]) => (
        <View key={label} style={local.fact}>
          <Text style={[local.factLabel, { color: labelColor }]}>{label}</Text>
          <Text style={local.factValue}>{value}</Text>
        </View>
      ))}
    </View>
  );
}

/** Verdict: drawn symbol + coloured headline over a tinted card, never colour alone. */
export function ResultCard({
  outcome,
  locale,
  onScanNext,
  onRetry,
  onUndo,
}: {
  outcome: Outcome;
  locale: Locale;
  onScanNext?: () => void;
  onRetry?: () => void;
  onUndo?: () => void;
}) {
  const t = checkInCopy[locale];
  const tone = feedback[verdictFeedback(outcome.kind)];
  const cause =
    outcome.kind === "unknown"
      ? outcome.cause === "timeout"
        ? t.timeout
        : t.offline
      : null;
  const retry = onRetry && (outcome.kind === "unknown" || outcome.kind === "error");
  const undo = onUndo && outcome.kind === "accepted" && outcome.ticket;
  return (
    <View style={local.result}>
      <View
        accessible
        accessibilityRole="alert"
        accessibilityLiveRegion="assertive"
        style={local.verdict}
      >
        <View style={local.headline}>
          <VerdictIcon glyph={glyphOf(outcome.kind)} tint={tone.text} size={38} />
          <Text style={[local.title, { color: tone.text }]}>{t.outcome[outcome.kind]}</Text>
        </View>
        <View style={[local.panel, { backgroundColor: tone.soft, borderColor: tone.line }]}>
          <Text style={local.detail}>{t.detail[outcome.kind]}</Text>
          {cause ? <Text style={local.body}>{cause}</Text> : null}
          {outcome.reconciled ? <Text style={local.detail}>{t.reconciled}</Text> : null}
          {outcome.ticket ? (
            <TicketFacts ticket={outcome.ticket} locale={locale} labelColor={tone.text} />
          ) : null}
        </View>
        {outcome.latencyMs !== null && outcome.kind !== "unknown" ? (
          <Muted>
            {t.serverTime} {outcome.latencyMs} {t.ms}
          </Muted>
        ) : null}
        {outcome.code ? (
          <Muted>
            {outcome.code}
            {outcome.requestId ? ` · ${outcome.requestId}` : ""}
          </Muted>
        ) : null}
      </View>
      {retry ? <Action title={t.retry} variant="primary" onPress={onRetry} /> : null}
      {onScanNext ? (
        <Action title={t.scanNext} variant={retry ? "secondary" : "primary"} onPress={onScanNext} />
      ) : null}
      {undo ? <Action title={t.undo} onPress={onUndo} /> : null}
    </View>
  );
}

/** Reason + confirmation before reverting a check-in; refreshed state comes from the server. */
export function UndoSheet({
  ticket,
  locale,
  onClose,
  onDone,
}: {
  ticket: { id: string; label: string } | null;
  locale: Locale;
  onClose: () => void;
  onDone: (updated: Ticket) => void;
}) {
  const t = checkInCopy[locale];
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    setReason("");
    setError("");
  }, [ticket?.id]);
  useEffect(() => () => active.current?.abort(), []);

  async function submit() {
    if (!ticket || !session || busy || !validUndoReason(reason)) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError("");
    try {
      const updated = await session.request<Ticket>(paths.undo(ticket.id), {
        method: "POST",
        body: { reason: reason.trim() },
        signal: controller.signal,
      });
      onDone(updated);
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(
        failure instanceof ApiError && failure.code === "not_checked_in"
          ? t.undoNotCheckedIn
          : failure instanceof ApiError && failure.code === "network_error"
            ? `${t.undoFailed} ${t.offline}`
            : t.undoFailed,
      );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }

  return (
    <Sheet visible={ticket !== null} onClose={onClose}>
      <Title subtitle={ticket?.label}>{t.undoTitle}</Title>
      <Card>
        <Body>{t.undoExplain}</Body>
      </Card>
      <Label nativeID="undo-reason-label">{t.undoReason}</Label>
      <Input
        accessibilityLabel={t.undoReason}
        accessibilityLabelledBy="undo-reason-label"
        value={reason}
        onChangeText={setReason}
        maxLength={UNDO_REASON_MAX}
        multiline
        editable={!busy}
        style={local.reason}
      />
      {error ? (
        <Callout tone="danger" alert>
          {error}
        </Callout>
      ) : null}
      <Action
        title={t.undoConfirm}
        variant="primary"
        busy={busy}
        disabled={busy || !validUndoReason(reason)}
        onPress={() => void submit()}
      />
      <Action title={t.undoCancel} disabled={busy} onPress={onClose} />
    </Sheet>
  );
}

const local = StyleSheet.create({
  result: { gap: 12 },
  verdict: { gap: 12 },
  headline: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { ...type.verdict, flexShrink: 1 },
  panel: { borderWidth: StyleSheet.hairlineWidth * 2, borderRadius: radius.card, padding: 16, gap: 8 },
  detail: { ...type.bodyStrong, color: color.ink },
  body: { ...type.body, color: color.ink },
  facts: { gap: 8, marginTop: 4 },
  fact: { gap: 1 },
  factLabel: { ...type.small },
  factValue: { ...type.bodyStrong, color: color.ink },
  reason: { minHeight: 96, textAlignVertical: "top" },
});
