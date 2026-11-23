import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { ApiError, formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { checkInCopy } from "./copy";
import { paths, scannableEvents } from "./model";
import type { StaffEvent } from "./model";
import { color, type } from "../theme";
import { Action, Body, Callout, Card, Muted, Pill, styles as ui, Title } from "../ui";

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
      style={ui.fill}
      contentContainerStyle={ui.content}
      refreshControl={
        <RefreshControl
          refreshing={loading}
          onRefresh={() => void load()}
          tintColor={color.primary}
          colors={[color.primary]}
        />
      }
      ListHeaderComponent={
        <View style={ui.stack}>
          {header}
          <Title subtitle={t.eventsIntro}>{t.events}</Title>
          {failed ? (
            <>
              <Callout tone="danger" alert>
                {`${t.loadFailed} (${failed})`}
              </Callout>
              <Action title={t.reload} variant="primary" onPress={() => void load()} />
            </>
          ) : null}
          {events === null && !failed ? <Muted live="polite">{t.loading}</Muted> : null}
        </View>
      }
      ListEmptyComponent={
        events !== null && !failed ? (
          <Card>
            <Body>{t.noEvents}</Body>
            <View style={local.cardAction}>
              <Action title={t.reload} variant="primary" onPress={() => void load()} />
            </View>
          </Card>
        ) : undefined
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
          <Card>
            <Text style={local.title}>{item.title}</Text>
            <Text style={local.when}>{when(item, locale)}</Text>
            <Muted>
              {item.venue_name}, {item.venue_city}
            </Muted>
            <View style={local.pills}>
              <Pill label={t.roles[item.role]} tone="primary" />
              {statusLabel ? <Pill label={statusLabel} tone="danger" /> : null}
            </View>
            {canScan ? (
              <View style={local.cardAction}>
                <Action
                  title={t.open}
                  variant="primary"
                  accessibilityHint={item.title}
                  onPress={() => onOpen(item)}
                />
              </View>
            ) : (
              <Muted>{t.notScannable}</Muted>
            )}
          </Card>
        );
      }}
    />
  );
}

const local = StyleSheet.create({
  title: { ...type.heading, color: color.ink },
  when: { ...type.body, color: color.ink },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  cardAction: { marginTop: 8 },
});
