import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { color, type } from "./theme";

/** The web header mark (frontend/web/src/icons.tsx), same geometry. */
export function BrandMark({ size = 28 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Rect width="32" height="32" rx="8" fill={color.primary} />
      <Path d="M11.5 7.5v16" stroke="#fff" strokeWidth={3.2} strokeLinecap="round" />
      <Circle cx="16.6" cy="18.4" r="5.1" fill="none" stroke="#fff" strokeWidth={3.2} />
    </Svg>
  );
}

/** Header title: mark + wordmark, read once as "BiletFlow". */
export function Brand() {
  return (
    <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="BiletFlow">
      <BrandMark />
      <Text style={styles.wordmark}>BiletFlow</Text>
    </View>
  );
}

export type Glyph = "check" | "cross" | "alert" | "question";

/** Verdict symbol drawn in one 2px stroke family, inside a filled disc. */
export function VerdictIcon({
  glyph,
  tint,
  size = 32,
}: {
  glyph: Glyph;
  tint: string;
  size?: number;
}) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Circle cx="16" cy="16" r="16" fill={tint} />
      {glyph === "check" ? (
        <Path d="M9.5 16.5l4.5 4.5 8.5-9" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      ) : glyph === "cross" ? (
        <Path d="M11 11l10 10M21 11L11 21" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" />
      ) : glyph === "alert" ? (
        <>
          <Path d="M16 9.5v8" stroke="#fff" strokeWidth={3} strokeLinecap="round" fill="none" />
          <Circle cx="16" cy="22.5" r="1.9" fill="#fff" />
        </>
      ) : (
        <>
          <Path
            d="M12.4 12.6a3.8 3.8 0 117.2 1.7c-.9 1.6-3.6 2.2-3.6 4.4v.6"
            stroke="#fff"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <Circle cx="16" cy="23.4" r="1.9" fill="#fff" />
        </>
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: "row", alignItems: "center", gap: 9 },
  wordmark: { ...type.heading, fontSize: 19, letterSpacing: -0.4, color: color.ink },
});

export type TabGlyph = "web" | "tickets" | "scan";

/** Bottom-tab symbols in the same 2px stroke family. */
export function TabIcon({ glyph, tint, size = 24 }: { glyph: TabGlyph; tint: string; size?: number }) {
  const stroke = { stroke: tint, strokeWidth: 2, fill: "none", strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {glyph === "web" ? (
        <>
          <Circle cx="12" cy="12" r="9" {...stroke} />
          <Path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" {...stroke} />
        </>
      ) : glyph === "tickets" ? (
        <Path d="M4 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6zM14 5v14" {...stroke} />
      ) : (
        <Path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2M4 12h16" {...stroke} />
      )}
    </Svg>
  );
}
