import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useIsFocused, useTheme } from "@react-navigation/native";
import { ApiError, formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { checkInCopy } from "./copy";
import { paths, scannableEvents } from "./model";
import type { StaffEvent } from "./model";
import { Action, Body, Heading, styles as ui, useBorderColor } from "./ui";

function when(event: StaffEvent, locale: Locale) {
  try {
    return formatEventDateTime(event.starts_at, event.timezone, locale);
  } catch {
    return event.starts_at;
  }
}

/** Events the signed-in account owns or is assigned to, straight from the server. */
export function EventsScreen({
  locale,
  onOpen,
  header,
}: {
  locale: Locale;
  onOpen: (event: StaffEvent) => void;
  header?: ReactNode;
}) {
  const t = checkInCopy[locale];
  const { colors } = useTheme();
  const border = useBorderColor();
  const focused = useIsFocused();
  const [events, setEvents] = useState<StaffEvent[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const active = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setFailed(null);
    try {
      const next = await session.request<StaffEvent[]>(paths.staffEvents, {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setEvents(next);
    } catch (error) {
      if (!controller.signal.aborted)
        setFailed(error instanceof ApiError ? error.code : "unexpected");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  // Re-read on every return to this screen: assignments can change at any time.
  useEffect(() => {
    if (focused) void load();
  }, [focused, load]);
  useEffect(() => () => active.current?.abort(), []);

  const scannable = new Set(scannableEvents(events ?? []).map((e) => e.event_id));

  return (
    <FlatList
      data={events ?? []}
      keyExtractor={(event) => event.event_id}
      contentContainerStyle={ui.content}
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={() => void load()} />
      }
      ListHeaderComponent={
        <View style={local.header}>
          {header}
          <Heading>{t.events}</Heading>
          <Body>{t.eventsIntro}</Body>
          {failed ? (
            <>
              <Body live="assertive">
                {t.loadFailed} ({failed})
              </Body>
              <Action title={t.reload} onPress={() => void load()} />
            </>
          ) : null}
          {events === null && !failed ? <Body live="polite">{t.loading}</Body> : null}
        </View>
      }
      ListEmptyComponent={
        events !== null && !failed ? <Body>{t.noEvents}</Body> : undefined
      }
      renderItem={({ item }) => {
        const canScan = scannable.has(item.event_id);
        const statusLabel =
          item.status === "cancelled"
            ? t.cancelledEvent
            : item.status === "suspended"
              ? t.suspendedEvent
              : null;
        return (
          <View style={[ui.card, local.card, { borderColor: border, backgroundColor: colors.card }]}>
            <Text style={[local.title, { color: colors.text }]}>{item.title}</Text>
            <Text style={[ui.muted, { color: colors.text }]}>{when(item, locale)}</Text>
            <Text style={[ui.muted, { color: colors.text }]}>
              {item.venue_name}, {item.venue_city}
            </Text>
            <Text style={[local.role, { color: colors.text }]}>
              {t.roles[item.role]}
              {statusLabel ? ` · ${statusLabel}` : ""}
            </Text>
            {canScan ? (
              <Action
                title={t.open}
                variant="primary"
                accessibilityHint={item.title}
                onPress={() => onOpen(item)}
              />
            ) : (
              <Text style={[ui.muted, { color: colors.text }]}>{t.notScannable}</Text>
            )}
          </View>
        );
      }}
    />
  );
}

const local = StyleSheet.create({
  header: { gap: 12, marginBottom: 4 },
  card: { marginBottom: 12 },
  title: { fontSize: 19, fontWeight: "700" },
  role: { fontSize: 15, fontWeight: "600" },
});
