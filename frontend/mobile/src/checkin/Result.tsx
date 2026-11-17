import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@react-navigation/native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { checkInCopy } from "./copy";
import { paths, toneOf, UNDO_REASON_MAX, validUndoReason } from "./model";
import type { Outcome, Ticket } from "./model";
import {
  Action,
  Body,
  Heading,
  Sheet,
  styles as ui,
  tonePalette,
  useBorderColor,
} from "./ui";

export function TicketFacts({
  ticket,
  locale,
  color,
}: {
  ticket: Ticket;
  locale: Locale;
  color?: string;
}) {
  const t = checkInCopy[locale];
  const { colors } = useTheme();
  const text = { color: color ?? colors.text };
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
        <Text key={label} style={[local.fact, text]}>
          <Text style={local.factLabel}>{label}: </Text>
          {value}
        </Text>
      ))}
    </View>
  );
}

/** Full-width verdict banner: symbol + headline + instruction, never color alone. */
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
  const tone = tonePalette[toneOf(outcome.kind)];
  const textColor = { color: tone.text };
  const cause =
    outcome.kind === "unknown"
      ? outcome.cause === "timeout"
        ? t.timeout
        : t.offline
      : null;
  return (
    <View
      accessible
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
      style={[local.card, { backgroundColor: tone.background }]}
    >
      <View style={local.headline}>
        <Text style={[local.symbol, textColor]} accessibilityElementsHidden>
          {tone.symbol}
        </Text>
        <Text style={[local.title, textColor]}>{t.outcome[outcome.kind]}</Text>
      </View>
      <Text style={[local.detail, textColor]}>{t.detail[outcome.kind]}</Text>
      {cause ? <Text style={[local.detail, textColor]}>{cause}</Text> : null}
      {outcome.reconciled ? (
        <Text style={[local.detail, textColor, local.strong]}>
          {t.reconciled}
        </Text>
      ) : null}
      {outcome.ticket ? (
        <TicketFacts ticket={outcome.ticket} locale={locale} color={tone.text} />
      ) : null}
      {outcome.latencyMs !== null && outcome.kind !== "unknown" ? (
        <Text style={[local.meta, textColor]}>
          {t.serverTime} {outcome.latencyMs} {t.ms}
        </Text>
      ) : null}
      {outcome.code ? (
        <Text style={[local.meta, textColor]}>
          {outcome.code}
          {outcome.requestId ? ` · ${outcome.requestId}` : ""}
        </Text>
      ) : null}
      <View style={local.actions}>
        {onRetry && (outcome.kind === "unknown" || outcome.kind === "error") ? (
          <Action title={t.retry} onPress={onRetry} />
        ) : null}
        {onUndo && outcome.kind === "accepted" && outcome.ticket ? (
          <Action title={t.undo} onPress={onUndo} />
        ) : null}
        {onScanNext ? (
          <Action title={t.scanNext} onPress={onScanNext} variant="primary" />
        ) : null}
      </View>
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
  const { colors } = useTheme();
  const border = useBorderColor();
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
      <Heading>{t.undoTitle}</Heading>
      {ticket ? <Body style={local.strong}>{ticket.label}</Body> : null}
      <Body>{t.undoExplain}</Body>
      <Text nativeID="undo-reason-label" style={[ui.body, { color: colors.text }]}>
        {t.undoReason}
      </Text>
      <TextInput
        accessibilityLabel={t.undoReason}
        accessibilityLabelledBy="undo-reason-label"
        value={reason}
        onChangeText={setReason}
        maxLength={UNDO_REASON_MAX}
        multiline
        editable={!busy}
        style={[
          ui.input,
          local.reason,
          { color: colors.text, borderColor: border, backgroundColor: colors.card },
        ]}
      />
      {error ? (
        <Body live="assertive" style={local.strong}>
          {error}
        </Body>
      ) : null}
      <Action
        title={t.undoConfirm}
        variant="danger"
        busy={busy}
        disabled={busy || !validUndoReason(reason)}
        onPress={() => void submit()}
      />
      <Action title={t.undoCancel} disabled={busy} onPress={onClose} />
    </Sheet>
  );
}

const local = StyleSheet.create({
  card: { borderRadius: 10, padding: 18, gap: 8 },
  headline: { flexDirection: "row", alignItems: "center", gap: 12 },
  symbol: { fontSize: 40, fontWeight: "800", lineHeight: 46 },
  title: { fontSize: 28, fontWeight: "800", flexShrink: 1 },
  detail: { fontSize: 17, lineHeight: 24 },
  strong: { fontWeight: "700" },
  meta: { fontSize: 14, opacity: 0.9 },
  facts: { gap: 2, marginTop: 4 },
  fact: { fontSize: 17, lineHeight: 24 },
  factLabel: { fontWeight: "700" },
  actions: { gap: 10, marginTop: 8 },
  reason: { minHeight: 90, textAlignVertical: "top" },
});
