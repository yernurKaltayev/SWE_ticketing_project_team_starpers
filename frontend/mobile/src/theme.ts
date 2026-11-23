import { DefaultTheme } from "@react-navigation/native";
import type { Theme } from "@react-navigation/native";
import type { TextStyle } from "react-native";
import type { OutcomeKind } from "./checkin/model";

/**
 * BiletFlow white UI, the same tokens as frontend/web/src/index.css (Figma
 * "BiletFlow · White UI · Complete flows", frames M1–M14). Light only.
 */
export const color = {
  ink: "#14243a",
  muted: "#66758a",
  canvas: "#f8fafc",
  surface: "#ffffff",
  line: "#e7ecf3",
  lineStrong: "#cfd7e3",
  primary: "#455ce9",
  primaryPress: "#2b3db6",
  primarySoft: "#edf0ff",
  success: "#167451",
  successSoft: "#e9f8f1",
  successLine: "#bfe5d3",
  danger: "#bb3240",
  dangerSoft: "#fff0f2",
  dangerLine: "#f4c5cc",
  warning: "#946200",
  warningSoft: "#fff7e6",
  warningLine: "#f1dcae",
  camera: "#0f1724",
  onPrimary: "#ffffff",
  scrim: "rgba(20, 36, 58, 0.42)",
} as const;

export const radius = { card: 12, control: 10, sheet: 18, chip: 999 } as const;

export const space = { page: 20, gap: 12, section: 24 } as const;

/** Inter, loaded in App.tsx. A custom face picks its weight by family, not fontWeight. */
export const fontFiles = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

const face = (family: string): TextStyle => ({ fontFamily: family });

export const type = {
  title: { ...face(fontFiles.bold), fontSize: 26, lineHeight: 32, letterSpacing: -0.4 },
  heading: { ...face(fontFiles.semibold), fontSize: 18, lineHeight: 24, letterSpacing: -0.2 },
  body: { ...face(fontFiles.regular), fontSize: 16, lineHeight: 24 },
  bodyStrong: { ...face(fontFiles.semibold), fontSize: 16, lineHeight: 24 },
  small: { ...face(fontFiles.regular), fontSize: 14, lineHeight: 20 },
  label: { ...face(fontFiles.semibold), fontSize: 14, lineHeight: 20 },
  button: { ...face(fontFiles.semibold), fontSize: 16, lineHeight: 22 },
  caps: { ...face(fontFiles.bold), fontSize: 13, lineHeight: 18, letterSpacing: 0.6 },
  verdict: { ...face(fontFiles.bold), fontSize: 28, lineHeight: 34, letterSpacing: -0.4 },
  stat: {
    ...face(fontFiles.bold),
    fontSize: 22,
    lineHeight: 28,
    fontVariant: ["tabular-nums"],
  },
} satisfies Record<string, TextStyle>;

/** Soft card shadow, as --shadow-card on the web. */
export const raised = {
  shadowColor: color.ink,
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 1,
} as const;

export type Feedback = "success" | "warning" | "danger";

export const feedback: Record<Feedback, { text: string; soft: string; line: string }> = {
  success: { text: color.success, soft: color.successSoft, line: color.successLine },
  warning: { text: color.warning, soft: color.warningSoft, line: color.warningLine },
  danger: { text: color.danger, soft: color.dangerSoft, line: color.dangerLine },
};

/**
 * Verdict colours follow Figma M4–M9: admit green; already used, wrong event and
 * unknown results amber (stop and check); every other refusal red. Only the colour
 * differs per kind; vibration and admission logic still follow the tone.
 */
export function verdictFeedback(kind: OutcomeKind): Feedback {
  if (kind === "accepted") return "success";
  if (kind === "already_used" || kind === "wrong_event" || kind === "unknown" || kind === "error")
    return "warning";
  return "danger";
}

export const navigationTheme: Theme = {
  ...DefaultTheme,
  dark: false,
  colors: {
    ...DefaultTheme.colors,
    primary: color.primary,
    background: color.canvas,
    card: color.surface,
    text: color.ink,
    border: color.line,
    notification: color.danger,
  },
  fonts: {
    regular: { fontFamily: fontFiles.regular, fontWeight: "400" },
    medium: { fontFamily: fontFiles.medium, fontWeight: "500" },
    bold: { fontFamily: fontFiles.semibold, fontWeight: "600" },
    heavy: { fontFamily: fontFiles.bold, fontWeight: "700" },
  },
};
