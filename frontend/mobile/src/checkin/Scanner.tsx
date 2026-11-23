import { useCallback, useEffect, useRef, useState } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  AppState,
  Linking,
  StyleSheet,
  Text,
  Vibration,
  View,
} from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { BarcodeScanningResult } from "expo-camera";
import { useIsFocused } from "@react-navigation/native";
import type { Locale } from "@biletflow/shared";
import { session } from "../session";
import { checkInCopy } from "./copy";
import {
  createScanGate,
  paths,
  reconcile,
  runVerification,
  SLOW_AFTER_MS,
  toneOf,
} from "./model";
import type { Outcome, Ticket, VerifyOut } from "./model";
import { ResultCard } from "./Result";
import { color, radius, type } from "../theme";
import { Action, Callout, Card, Muted } from "../ui";

type Phase =
  | { name: "ready" }
  | { name: "verifying"; slow: boolean }
  | { name: "result"; outcome: Outcome; payload: string };

/** Distinct vibration per tone, so staff can keep their eyes on the queue. */
const vibration: Record<ReturnType<typeof toneOf>, number[]> = {
  admit: [0, 80],
  reject: [0, 250, 120, 250],
  unknown: [0, 120, 80, 120, 80, 120],
};

function useAppActive() {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) =>
      setActive(state === "active"),
    );
    return () => subscription.remove();
  }, []);
  return active;
}

export function Scanner({
  eventId,
  locale,
  visible,
  onAdmitted,
  onUndo,
}: {
  eventId: string;
  locale: Locale;
  /** False while another tab is shown: the camera is released. */
  visible: boolean;
  onAdmitted: () => void;
  onUndo: (ticket: Ticket) => void;
}) {
  const t = checkInCopy[locale];
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const focused = useIsFocused();
  const appActive = useAppActive();
  const [phase, setPhase] = useState<Phase>({ name: "ready" });
  const [cameraFailed, setCameraFailed] = useState(false);
  const gate = useRef(createScanGate()).current;
  const inFlight = useRef<AbortController | null>(null);
  const previous = useRef<{ payload: string; outcome: Outcome } | null>(null);

  // Re-read the permission when returning from the phone settings.
  useEffect(() => {
    if (appActive) void getPermission();
  }, [appActive, getPermission]);
  // Leaving the screen cancels a pending request; its result would be shown to nobody.
  useEffect(() => () => inFlight.current?.abort(), []);

  const verify = useCallback(
    async (payload: string) => {
      if (!session) return;
      inFlight.current?.abort();
      const controller = new AbortController();
      inFlight.current = controller;
      setPhase({ name: "verifying", slow: false });
      const slowTimer = setTimeout(
        () => setPhase({ name: "verifying", slow: true }),
        SLOW_AFTER_MS,
      );
      let outcome: Outcome;
      try {
        outcome = await runVerification(
          (signal) =>
            session!.request<VerifyOut>(paths.verify, {
              method: "POST",
              body: { event_id: eventId, qr_payload: payload },
              signal,
            }),
          { signal: controller.signal },
        );
      } catch {
        return; // cancelled because the screen closed
      } finally {
        clearTimeout(slowTimer);
      }
      if (controller.signal.aborted) return;
      outcome = reconcile(previous.current, payload, outcome);
      previous.current = { payload, outcome };
      setPhase({ name: "result", outcome, payload });
      const tone = toneOf(outcome.kind);
      Vibration.vibrate(vibration[tone]);
      AccessibilityInfo.announceForAccessibility(
        `${t.outcome[outcome.kind]}. ${t.detail[outcome.kind]}`,
      );
      if (outcome.kind === "accepted") onAdmitted();
    },
    [eventId, onAdmitted, t],
  );

  const onScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      if (gate.tryBegin(data)) void verify(data.trim());
    },
    [gate, verify],
  );

  function scanNext() {
    gate.release();
    setPhase({ name: "ready" });
  }

  const cameraOn =
    visible && focused && appActive && permission?.granted === true;

  if (!visible) return null;

  if (!permission) return <Muted live="polite">{t.loading}</Muted>;

  if (!permission.granted) {
    return (
      <Card>
        <Text style={local.cardText}>{permission.canAskAgain ? t.cameraAsk : t.cameraDenied}</Text>
        <View style={local.cardAction}>
          {permission.canAskAgain ? (
            <Action
              title={t.cameraAllow}
              variant="primary"
              onPress={() => void requestPermission()}
            />
          ) : (
            <Action
              title={t.cameraOpenSettings}
              variant="primary"
              onPress={() => void Linking.openSettings()}
            />
          )}
        </View>
      </Card>
    );
  }

  if (cameraFailed && phase.name !== "result")
    return <Callout tone="warning">{t.cameraUnavailable}</Callout>;

  return (
    <View style={local.wrap}>
      {phase.name === "result" ? (
        <ResultCard
          outcome={phase.outcome}
          locale={locale}
          onScanNext={scanNext}
          onRetry={() => void verify(phase.payload)}
          onUndo={
            phase.outcome.ticket
              ? () => onUndo(phase.outcome.ticket!)
              : undefined
          }
        />
      ) : (
        <>
          <View
            style={local.viewport}
            accessible
            accessibilityLabel={cameraOn ? t.aim : t.paused}
          >
            {cameraOn ? (
              <CameraView
                style={StyleSheet.absoluteFill}
                facing="back"
                barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                onBarcodeScanned={phase.name === "ready" ? onScanned : undefined}
                onMountError={() => setCameraFailed(true)}
              />
            ) : null}
            <View style={local.frame} pointerEvents="none">
              <View style={[local.corner, local.topLeft]} />
              <View style={[local.corner, local.topRight]} />
              <View style={[local.corner, local.bottomLeft]} />
              <View style={[local.corner, local.bottomRight]} />
            </View>
            {phase.name === "verifying" ? (
              <View style={local.verifying} pointerEvents="none">
                <ActivityIndicator color={color.onPrimary} accessibilityElementsHidden />
              </View>
            ) : null}
          </View>
          <Text
            accessibilityLiveRegion="polite"
            style={[local.status, phase.name === "verifying" && phase.slow && local.slow]}
          >
            {phase.name === "verifying"
              ? phase.slow
                ? t.slow
                : t.verifying
              : cameraOn
                ? t.aim
                : t.paused}
          </Text>
        </>
      )}
    </View>
  );
}

const CORNER = 30;
const STROKE = 4;

const local = StyleSheet.create({
  wrap: { gap: 12 },
  cardText: { ...type.body, color: color.ink },
  cardAction: { marginTop: 8 },
  viewport: {
    width: "100%",
    aspectRatio: 1,
    borderRadius: radius.card,
    overflow: "hidden",
    backgroundColor: color.camera,
    justifyContent: "center",
    alignItems: "center",
  },
  frame: { width: "64%", aspectRatio: 1 },
  corner: { position: "absolute", width: CORNER, height: CORNER, borderColor: "#ffffff" },
  topLeft: { top: 0, left: 0, borderTopWidth: STROKE, borderLeftWidth: STROKE, borderTopLeftRadius: 14 },
  topRight: { top: 0, right: 0, borderTopWidth: STROKE, borderRightWidth: STROKE, borderTopRightRadius: 14 },
  bottomLeft: { bottom: 0, left: 0, borderBottomWidth: STROKE, borderLeftWidth: STROKE, borderBottomLeftRadius: 14 },
  bottomRight: { bottom: 0, right: 0, borderBottomWidth: STROKE, borderRightWidth: STROKE, borderBottomRightRadius: 14 },
  verifying: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(15, 23, 36, 0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  status: { ...type.body, color: color.muted, textAlign: "center" },
  slow: { ...type.bodyStrong, color: color.warning },
});
