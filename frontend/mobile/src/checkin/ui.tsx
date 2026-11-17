import { useState } from "react";
import type { ReactNode } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { StyleProp, TextStyle } from "react-native";
import { useTheme } from "@react-navigation/native";
import type { Tone } from "./model";

/** High-contrast result colors; white text passes WCAG AA on each. Symbols avoid color-only cues. */
export const tonePalette: Record<
  Tone,
  { background: string; text: string; symbol: string }
> = {
  admit: { background: "#0B6B3A", text: "#FFFFFF", symbol: "✓" },
  reject: { background: "#A4161A", text: "#FFFFFF", symbol: "✕" },
  unknown: { background: "#7A4E00", text: "#FFFFFF", symbol: "?" },
};

export function useBorderColor() {
  const { dark } = useTheme();
  return dark ? "#87958e" : "#70837b";
}

export function Body({
  children,
  style,
  live,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  live?: "polite" | "assertive";
}) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityLiveRegion={live}
      style={[styles.body, { color: colors.text }, style]}
    >
      {children}
    </Text>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  const { colors } = useTheme();
  return (
    <Text
      accessibilityRole="header"
      style={[styles.heading, { color: colors.text }]}
    >
      {children}
    </Text>
  );
}

export function Action({
  title,
  onPress,
  disabled = false,
  busy = false,
  variant = "default",
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "default" | "primary" | "danger";
  accessibilityHint?: string;
}) {
  const { colors } = useTheme();
  const border = useBorderColor();
  const [focused, setFocused] = useState(false);
  const filled =
    variant === "primary"
      ? colors.primary
      : variant === "danger"
        ? tonePalette.reject.background
        : null;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor:
            filled ?? (pressed && !disabled ? colors.border : colors.card),
          borderColor: focused ? colors.text : (filled ?? border),
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.actionText,
          { color: filled ? "#FFFFFF" : colors.text },
        ]}
      >
        {title}
      </Text>
    </Pressable>
  );
}

export function Sheet({
  visible,
  onClose,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: colors.background }]}
        >
          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
          >
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 20, gap: 14 },
  heading: { fontSize: 24, fontWeight: "700" },
  body: { fontSize: 17, lineHeight: 25 },
  muted: { fontSize: 15, lineHeight: 22, opacity: 0.8 },
  action: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderRadius: 6,
    justifyContent: "center",
  },
  actionText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    textAlign: "center",
  },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 6,
    padding: 12,
    fontSize: 17,
  },
  card: { borderWidth: 1, borderRadius: 8, padding: 16, gap: 8 },
  backdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  sheet: {
    maxHeight: "85%",
    borderTopLeftRadius: 14,
    borderTopRightRadius: 14,
  },
  sheetContent: { padding: 20, gap: 14, paddingBottom: 36 },
});
