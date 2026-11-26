import { useCallback, useEffect, useState } from "react";
import { FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { useQueries } from "@tanstack/react-query";
import { queryKeys } from "@biletflow/shared/features/query-keys";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useAuthedQuery } from "../data";
import { session, useSessionSnapshot } from "../session";
import { color, type } from "../theme";
import { Action, Body, Callout, Card, Muted, Pill, styles as ui, Title } from "../ui";
import { ticketsCopy } from "./copy";
import { commerceCopy } from "@biletflow/shared/features/checkout/copy";
import { ticketPaths, ticketTone } from "./model";
import type { MyTicket, TicketPage } from "./model";

type EventSummary = { title: string };

export function seatText(ticket: MyTicket): string | null {
  const seat = ticket.seat;
  return seat ? `${seat.section_name} · ${seat.row_label} · ${seat.seat_number}` : null;
}

/** The signed-in account's tickets: cached per account, re-read from the server on every visit. */
export function TicketsScreen({
  locale,
  onOpen,
}: {
  locale: Locale;
  onOpen: (ticket: MyTicket, eventTitle: string | null) => void;
}) {
  const t = ticketsCopy[locale];
  const focused = useIsFocused();
  const userId = useSessionSnapshot().user?.id ?? null;
  const list = useAuthedQuery<TicketPage>(
    queryKeys.commerce(userId, ticketPaths.mine()),
    ticketPaths.mine(),
  );
  const tickets = list.data?.items ?? null;
  const failed = list.error ? (list.error instanceof ApiError ? list.error.code : "unexpected") : null;
  const [pulling, setPulling] = useState(false);

  // Event titles are a nicety: a missing or private event never hides the ticket.
  const eventIds = [...new Set((tickets ?? []).map((ticket) => ticket.event_id))];
  const eventQueries = useQueries({
    queries: eventIds.map((id) => ({
      queryKey: queryKeys.commerce(userId, ticketPaths.event(id)),
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        session!.request<EventSummary>(ticketPaths.event(id), { signal }),
      retry: 0,
      staleTime: 5 * 60_000,
    })),
  });
  const events: Record<string, EventSummary> = {};
  eventIds.forEach((id, index) => {
    const event = eventQueries[index]?.data;
    if (event) events[id] = event;
  });

  // Every return to this tab asks the server again (a refund may have happened elsewhere).
  const { refetch } = list;
  useEffect(() => {
    if (focused) void refetch({ cancelRefetch: false });
  }, [focused, refetch]);

  const load = useCallback(async () => {
    setPulling(true);
    try {
      await refetch();
    } finally {
      setPulling(false);
    }
  }, [refetch]);

  return (
    <FlatList
      data={tickets ?? []}
      keyExtractor={(ticket) => ticket.id}
      style={ui.fill}
      contentContainerStyle={ui.content}
      refreshControl={
        <RefreshControl
          refreshing={pulling}
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
              <Pill label={`${commerceCopy[locale].ticketNumber}: ${item.ticket_number}`} />
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
