import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, StyleSheet, Text, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { color, radius, type } from "../theme";
import { Action, Callout, Card, Muted, Pill, Screen, Title } from "../ui";
import { ticketsCopy } from "./copy";
import { blobToDataUri, isAdmissible, ticketPaths, ticketTone } from "./model";
import type { MyTicket } from "./model";
import { seatText } from "./TicketsScreen";

/** One ticket with the server-issued QR, re-read on focus so a refund shows immediately. */
export function TicketDetail({
  ticketId,
  eventTitle,
  locale,
}: {
  ticketId: string;
  eventTitle: string | null;
  locale: Locale;
}) {
  const t = ticketsCopy[locale];
  const focused = useIsFocused();
  const [ticket, setTicket] = useState<MyTicket | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [qrFailed, setQrFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    setFailed(null);
    setQrFailed(false);
    try {
      const next = await session.request<MyTicket>(ticketPaths.ticket(ticketId), {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setTicket(next);
      try {
        const png = await session.request<Blob>(ticketPaths.qr(ticketId), {
          signal: controller.signal,
          responseType: "blob",
        });
        const uri = await blobToDataUri(png);
        if (!controller.signal.aborted) setQr(uri);
      } catch {
        if (!controller.signal.aborted) setQrFailed(true);
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setFailed(error instanceof ApiError ? error.code : "unexpected");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (focused) void load();
  }, [focused, load]);
  useEffect(() => () => active.current?.abort(), []);

  const seat = ticket ? seatText(ticket) : null;

  return (
    <Screen>
      <Title subtitle={ticket?.ticket_type}>{eventTitle ?? t.title}</Title>
      {failed ? (
        <>
          <Callout tone="danger" alert>
            {`${t.loadFailed} (${failed})`}
          </Callout>
          <Action title={t.reload} variant="primary" onPress={() => void load()} />
        </>
      ) : null}
      {ticket && !isAdmissible(ticket.status) ? (
        <Callout tone="danger" title={t.status[ticket.status] ?? ticket.status} alert>
          {t.invalidTicket}
        </Callout>
      ) : null}
      <View style={local.qrBox}>
        {qr ? (
          <Image
            source={{ uri: qr }}
            style={local.qr}
            resizeMode="contain"
            accessible
            accessibilityLabel={t.qrLabel}
          />
        ) : qrFailed ? (
          <View style={local.qrPlaceholder}>
            <Muted>{t.qrFailed}</Muted>
            <Action title={t.reload} onPress={() => void load()} />
          </View>
        ) : (
          <View style={local.qrPlaceholder}>
            <ActivityIndicator color={color.primary} />
          </View>
        )}
      </View>
      {ticket ? (
        <Card>
          <Text style={local.number}>{ticket.ticket_number}</Text>
          <Muted>{`${t.attendee}: ${ticket.attendee_name}`}</Muted>
          {seat ? <Muted>{`${t.seat}: ${seat}`}</Muted> : null}
          <View style={local.pills}>
            <Pill
              label={t.status[ticket.status] ?? ticket.status}
              tone={ticketTone(ticket.status)}
            />
          </View>
        </Card>
      ) : null}
      {loading && ticket ? <Muted live="polite">{t.loading}</Muted> : null}
    </Screen>
  );
}

const local = StyleSheet.create({
  // White, padded square so the code scans well even at low screen brightness.
  qrBox: {
    alignSelf: "center",
    backgroundColor: "#ffffff",
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: color.line,
    padding: 16,
    marginVertical: 8,
  },
  qr: { width: 280, height: 280 },
  qrPlaceholder: { width: 280, height: 280, alignItems: "center", justifyContent: "center", gap: 12 },
  number: { ...type.heading, color: color.ink },
  pills: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 },
});
