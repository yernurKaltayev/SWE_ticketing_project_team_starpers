import { useCallback, useEffect, useRef, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { color, type } from "../theme";
import { Action, Body, Callout, Card, Muted, Pill, styles as ui, Title } from "../ui";
import { ticketsCopy } from "./copy";
import { ticketPaths, ticketTone } from "./model";
import type { MyTicket, TicketPage } from "./model";

type EventSummary = { title: string };

export function seatText(ticket: MyTicket): string | null {
  const seat = ticket.seat;
  return seat ? `${seat.section_name} · ${seat.row_label} · ${seat.seat_number}` : null;
}

/** The signed-in account's tickets, newest page from the server on every visit. */
export function TicketsScreen({
  locale,
  onOpen,
}: {
  locale: Locale;
  onOpen: (ticket: MyTicket, eventTitle: string | null) => void;
}) {
  const t = ticketsCopy[locale];
  const focused = useIsFocused();
  const [tickets, setTickets] = useState<MyTicket[] | null>(null);
  const [events, setEvents] = useState<Record<string, EventSummary>>({});
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
      const page = await session.request<TicketPage>(ticketPaths.mine(), {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setTickets(page.items);
      // Event titles are a nicety: a missing or private event never hides the ticket.
      const ids = [...new Set(page.items.map((ticket) => ticket.event_id))];
      const found = await Promise.all(
        ids.map((id) =>
          session!
            .request<EventSummary>(ticketPaths.event(id), { signal: controller.signal })
            .then((event) => [id, event] as const)
            .catch(() => null),
        ),
      );
      if (!controller.signal.aborted)
        setEvents(Object.fromEntries(found.filter((entry) => entry !== null)));
    } catch (error) {
      if (!controller.signal.aborted)
        setFailed(error instanceof ApiError ? error.code : "unexpected");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (focused) void load();
  }, [focused, load]);
  useEffect(() => () => active.current?.abort(), []);

  return (
    <FlatList
      data={tickets ?? []}
      keyExtractor={(ticket) => ticket.id}
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
          <Title subtitle={t.intro}>{t.title}</Title>
          {failed ? (
            <>
              <Callout tone="danger" alert>
                {`${t.loadFailed} (${failed})`}
              </Callout>
              <Action title={t.reload} variant="primary" onPress={() => void load()} />
            </>
          ) : null}
          {tickets === null && !failed ? <Muted live="polite">{t.loading}</Muted> : null}
        </View>
      }
      ListEmptyComponent={
        tickets !== null && !failed ? (
          <Card>
            <Body>{t.empty}</Body>
          </Card>
        ) : undefined
      }
      renderItem={({ item }) => {
        const eventTitle = events[item.event_id]?.title ?? null;
        const seat = seatText(item);
        return (
          <Card>
            {eventTitle ? <Text style={local.title}>{eventTitle}</Text> : null}
            <Text style={local.line}>{item.ticket_type}</Text>
            <Muted>{item.attendee_name}</Muted>
            {seat ? <Muted>{`${t.seat}: ${seat}`}</Muted> : null}
            <View style={local.pills}>
              <Pill label={t.status[item.status] ?? item.status} tone={ticketTone(item.status)} />
              <Pill label={item.ticket_number} />
            </View>
            <View style={local.action}>
              <Action
                title={t.open}
                variant="primary"
                accessibilityHint={item.ticket_number}
                onPress={() => onOpen(item, eventTitle)}
              />
            </View>
          </Card>
        );
      }}
    />
  );
}

const local = StyleSheet.create({
  title: { ...type.heading, color: color.ink },
  line: { ...type.body, color: color.ink },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
  action: { marginTop: 8 },
});
