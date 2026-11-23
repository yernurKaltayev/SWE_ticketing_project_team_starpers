import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused } from "@react-navigation/native";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { color, type } from "../theme";
import { Action, Callout, Card, Muted, Segmented, styles as ui, Title } from "../ui";
import { checkInCopy } from "./copy";
import { paths, percent } from "./model";
import type { CheckInStats, Ticket } from "./model";
import { AttendeeSearch } from "./AttendeeSearch";
import { UndoSheet } from "./Result";
import { Scanner } from "./Scanner";

/** Counts are re-read on this interval while the screen is visible, to include other scanners. */
const STATS_REFRESH_MS = 30000;

type Mode = "scan" | "search";

export function CheckInScreen({
  eventId,
  title,
  locale,
}: {
  eventId: string;
  title: string;
  locale: Locale;
}) {
  const t = checkInCopy[locale];
  const focused = useIsFocused();
  const [mode, setMode] = useState<Mode>("scan");
  const [stats, setStats] = useState<CheckInStats | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [undoTarget, setUndoTarget] = useState<{ id: string; label: string } | null>(null);
  const [notice, setNotice] = useState("");
  const statsRequest = useRef<AbortController | null>(null);

  const loadStats = useCallback(async () => {
    if (!session) return;
    statsRequest.current?.abort();
    const controller = new AbortController();
    statsRequest.current = controller;
    try {
      const next = await session.request<CheckInStats>(paths.stats(eventId), {
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;
      setStats(next);
      setStatsFailed(false);
    } catch {
      if (!controller.signal.aborted) setStatsFailed(true);
    }
  }, [eventId]);

  useEffect(() => {
    if (!focused) return;
    void loadStats();
    const timer = setInterval(() => void loadStats(), STATS_REFRESH_MS);
    return () => clearInterval(timer);
  }, [focused, loadStats]);
  useEffect(() => () => statsRequest.current?.abort(), []);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const changed = useCallback(() => {
    setRevision((value) => value + 1);
    void loadStats();
  }, [loadStats]);

  const remaining = stats ? Math.max(0, stats.registered - stats.checked_in) : null;

  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={ui.fill}>
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <Title>{title}</Title>
        <Card style={local.statsCard}>
          <View
            style={local.stats}
            accessible
            accessibilityLabel={
              stats
                ? `${t.checkedIn} ${stats.checked_in}, ${t.registered} ${stats.registered}, ${t.remaining} ${remaining}`
                : t.loading
            }
          >
            <Stat label={t.checkedIn} value={stats ? `${stats.checked_in}` : "—"} strong />
            <Stat label={t.registered} value={stats ? `${stats.registered}` : "—"} />
            <Stat label={t.remaining} value={remaining === null ? "—" : `${remaining}`} />
            <Stat label="%" value={stats ? `${percent(stats)}` : "—"} last />
          </View>
        </Card>
        {statsFailed ? <Muted style={local.stale}>{t.countsStale}</Muted> : null}
        <Segmented
          kind="tabs"
          value={mode}
          onChange={setMode}
          options={[
            { value: "scan", label: t.scan },
            { value: "search", label: t.search },
          ]}
        />
        {notice ? <Callout tone="success">{notice}</Callout> : null}
        <Scanner
          eventId={eventId}
          locale={locale}
          visible={mode === "scan"}
          onAdmitted={changed}
          onUndo={(ticket: Ticket) =>
            setUndoTarget({
              id: ticket.id,
              label: `${ticket.attendee_name} · ${ticket.ticket_number}`,
            })
          }
        />
        <AttendeeSearch
          eventId={eventId}
          locale={locale}
          visible={mode === "search"}
          revision={revision}
          onChanged={changed}
          onUndo={(attendee) =>
            attendee.ticket_id &&
            setUndoTarget({
              id: attendee.ticket_id,
              label: `${attendee.full_name}${attendee.ticket_number ? ` · ${attendee.ticket_number}` : ""}`,
            })
          }
        />
        <Action title={t.refreshCounts} onPress={() => void loadStats()} />
      </ScrollView>
      <UndoSheet
        ticket={undoTarget}
        locale={locale}
        onClose={() => setUndoTarget(null)}
        onDone={() => {
          setUndoTarget(null);
          setNotice(t.undoDone);
          changed();
        }}
      />
    </SafeAreaView>
  );
}

function Stat({
  label,
  value,
  strong = false,
  last = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[local.stat, !last && local.divider]}>
      <Text style={[local.statValue, strong && local.statStrong]}>{value}</Text>
      <Text style={local.statLabel} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

const local = StyleSheet.create({
  statsCard: { paddingVertical: 12, paddingHorizontal: 4 },
  stats: { flexDirection: "row" },
  stat: { flex: 1, alignItems: "center", paddingHorizontal: 4, gap: 2 },
  divider: { borderRightWidth: StyleSheet.hairlineWidth * 2, borderRightColor: color.line },
  statValue: { ...type.stat, color: color.ink },
  statStrong: { color: color.success },
  statLabel: { ...type.small, fontSize: 12, lineHeight: 16, color: color.muted, textAlign: "center" },
  stale: { color: color.warning },
});
