import { useCallback, useEffect, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useIsFocused, useTheme } from "@react-navigation/native";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { checkInCopy } from "./copy";
import { paths, percent } from "./model";
import type { CheckInStats, Ticket } from "./model";
import { AttendeeSearch } from "./AttendeeSearch";
import { UndoSheet } from "./Result";
import { Scanner } from "./Scanner";
import { Action, Body, styles as ui, useBorderColor } from "./ui";

/** Counts are re-read on this interval while the screen is visible, to include other scanners. */
const STATS_REFRESH_MS = 30000;

type Mode = "scan" | "search";

export function CheckInScreen({
  eventId,
  locale,
}: {
  eventId: string;
  locale: Locale;
}) {
  const t = checkInCopy[locale];
  const { colors } = useTheme();
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
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[ui.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={ui.content} keyboardShouldPersistTaps="handled">
        <View
          style={local.stats}
          accessible
          accessibilityLabel={
            stats
              ? `${t.checkedIn} ${stats.checked_in}, ${t.registered} ${stats.registered}, ${t.remaining} ${remaining}`
              : t.loading
          }
        >
          <Stat label={t.checkedIn} value={stats ? `${stats.checked_in}` : "—"} />
          <Stat label={t.registered} value={stats ? `${stats.registered}` : "—"} />
          <Stat label={t.remaining} value={remaining === null ? "—" : `${remaining}`} />
          <Stat label="%" value={stats ? `${percent(stats)}` : "—"} />
        </View>
        {statsFailed ? (
          <Text style={[ui.muted, { color: colors.text }]}>{t.countsStale}</Text>
        ) : null}
        <View style={local.tabs} accessibilityRole="tablist">
          {(["scan", "search"] as const).map((value) => (
            <Tab
              key={value}
              label={value === "scan" ? t.scan : t.search}
              selected={mode === value}
              onPress={() => setMode(value)}
            />
          ))}
        </View>
        {notice ? (
          <Body live="polite" style={local.notice}>
            {notice}
          </Body>
        ) : null}
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

function Stat({ label, value }: { label: string; value: string }) {
  const { colors } = useTheme();
  const border = useBorderColor();
  return (
    <View style={[local.stat, { borderColor: border, backgroundColor: colors.card }]}>
      <Text style={[local.statValue, { color: colors.text }]}>{value}</Text>
      <Text style={[local.statLabel, { color: colors.text }]} numberOfLines={2}>
        {label}
      </Text>
    </View>
  );
}

function Tab({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const border = useBorderColor();
  return (
    <Pressable
      accessibilityRole="tab"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[
        local.tab,
        {
          borderColor: selected ? colors.primary : border,
          backgroundColor: selected ? colors.primary : colors.card,
        },
      ]}
    >
      <Text style={[local.tabText, { color: selected ? "#FFFFFF" : colors.text }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const local = StyleSheet.create({
  stats: { flexDirection: "row", gap: 8 },
  stat: { flex: 1, borderWidth: 1, borderRadius: 8, paddingVertical: 10, paddingHorizontal: 6, alignItems: "center" },
  statValue: { fontSize: 24, fontWeight: "800", fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 13, textAlign: "center" },
  tabs: { flexDirection: "row", gap: 8 },
  tab: { flex: 1, minHeight: 48, borderWidth: 2, borderRadius: 6, justifyContent: "center" },
  tabText: { fontSize: 17, fontWeight: "700", textAlign: "center" },
  notice: { fontWeight: "600" },
});
