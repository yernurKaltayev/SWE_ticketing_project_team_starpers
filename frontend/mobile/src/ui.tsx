import { useState } from "react";
import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { StyleProp, TextInputProps, TextStyle, ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { color, feedback, radius, raised, space, type } from "./theme";
import type { Feedback } from "./theme";

/** Canvas page with safe areas, keyboard avoidance and the standard content rhythm. */
export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView edges={["bottom", "left", "right"]} style={styles.fill}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Page title with its muted subtitle, as every Figma M-frame opens. */
export function Title({ children, subtitle }: { children: ReactNode; subtitle?: ReactNode }) {
  return (
    <View style={styles.titleBlock}>
      <Text accessibilityRole="header" style={styles.title}>
        {children}
      </Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Heading({ children }: { children: ReactNode }) {
  return (
    <Text accessibilityRole="header" style={styles.heading}>
      {children}
    </Text>
  );
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
  return (
    <Text accessibilityLiveRegion={live} style={[styles.body, style]}>
      {children}
    </Text>
  );
}

export function Muted({
  children,
  live,
  style,
}: {
  children: ReactNode;
  live?: "polite" | "assertive";
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text accessibilityLiveRegion={live} style={[styles.muted, style]}>
      {children}
    </Text>
  );
}

export function Label({ children, nativeID }: { children: ReactNode; nativeID?: string }) {
  return (
    <Text nativeID={nativeID} style={styles.label}>
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Tinted status field (Figma's "Sign-in failed", "NOT CHECKED IN LOCALLY" panels). */
export function Callout({
  tone,
  title,
  children,
  alert = false,
}: {
  tone: Feedback | "info";
  title?: string;
  children?: ReactNode;
  alert?: boolean;
}) {
  const palette =
    tone === "info"
      ? { text: color.primary, soft: color.primarySoft, line: "#d6dcfc" }
      : feedback[tone];
  return (
    <View
      accessibilityRole={alert ? "alert" : undefined}
      accessibilityLiveRegion={alert ? "assertive" : "polite"}
      style={[styles.callout, { backgroundColor: palette.soft, borderColor: palette.line }]}
    >
      {title ? <Text style={[styles.calloutTitle, { color: palette.text }]}>{title}</Text> : null}
      {typeof children === "string" ? <Text style={styles.body}>{children}</Text> : children}
    </View>
  );
}

export function Pill({ label, tone = "neutral" }: { label: string; tone?: Feedback | "neutral" | "primary" }) {
  const palette =
    tone === "neutral"
      ? { text: color.ink, soft: color.canvas, line: color.lineStrong }
      : tone === "primary"
        ? { text: color.primary, soft: color.primarySoft, line: color.primarySoft }
        : feedback[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.soft, borderColor: palette.line }]}>
      <Text style={[styles.pillText, { color: palette.text }]}>{label}</Text>
    </View>
  );
}

export function Action({
  title,
  onPress,
  disabled = false,
  busy = false,
  variant = "secondary",
  accessibilityHint,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  busy?: boolean;
  variant?: "primary" | "secondary";
  accessibilityHint?: string;
}) {
  const [focused, setFocused] = useState(false);
  const primary = variant === "primary";
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
        primary ? styles.actionPrimary : styles.actionSecondary,
        pressed && !disabled && (primary ? styles.primaryPressed : styles.secondaryPressed),
        focused && styles.focused,
        disabled && styles.disabled,
      ]}
    >
      {busy ? (
        <ActivityIndicator
          size="small"
          color={primary ? color.onPrimary : color.primary}
          accessibilityElementsHidden
        />
      ) : null}
      <Text style={[styles.actionText, { color: primary ? color.onPrimary : color.ink }]}>
        {title}
      </Text>
    </Pressable>
  );
}

/** Blue text button for the navigation bar. */
export function HeaderAction({ title, onPress }: { title: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [styles.headerAction, pressed && { opacity: 0.55 }]}
    >
      <Text style={styles.headerActionText}>{title}</Text>
    </Pressable>
  );
}

export function Input({ style, onFocus, onBlur, editable = true, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      editable={editable}
      placeholderTextColor={color.muted}
      selectionColor={color.primary}
      cursorColor={color.primary}
      onFocus={(event) => {
        setFocused(true);
        onFocus?.(event);
      }}
      onBlur={(event) => {
        setFocused(false);
        onBlur?.(event);
      }}
      style={[
        styles.input,
        focused && styles.inputFocused,
        !editable && styles.inputDisabled,
        style,
      ]}
    />
  );
}

/** Segmented control. `tabs` switches panels; `choice` picks a setting (language). */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  kind,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  kind: "tabs" | "choice";
}) {
  return (
    <View style={styles.segmented} accessibilityRole={kind === "tabs" ? "tablist" : "radiogroup"}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole={kind === "tabs" ? "tab" : "radio"}
            accessibilityLabel={option.label}
            accessibilityState={{ selected, checked: kind === "choice" ? selected : undefined }}
            onPress={() => onChange(option.value)}
            style={({ pressed }) => [
              styles.segment,
              selected && styles.segmentSelected,
              pressed && !selected && styles.segmentPressed,
            ]}
          >
            <Text
              numberOfLines={1}
              style={[styles.segmentText, selected && styles.segmentTextSelected]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.backdrop}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <SafeAreaView edges={["bottom"]} accessibilityViewIsModal style={styles.sheet}>
            <View style={styles.grabber} accessibilityElementsHidden />
            <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
              {children}
            </ScrollView>
          </SafeAreaView>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

export const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.canvas },
  content: { padding: space.page, paddingBottom: 40, gap: space.gap },
  stack: { gap: space.gap },
  titleBlock: { gap: 6, marginBottom: 4 },
  title: { ...type.title, color: color.ink },
  subtitle: { ...type.body, color: color.muted },
  heading: { ...type.heading, color: color.ink },
  body: { ...type.body, color: color.ink },
  muted: { ...type.small, color: color.muted },
  label: { ...type.label, color: color.ink, marginBottom: -4 },
  card: {
    backgroundColor: color.surface,
    borderColor: color.line,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.card,
    padding: 16,
    gap: 6,
    ...raised,
  },
  callout: {
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.card,
    padding: 16,
    gap: 6,
  },
  calloutTitle: { ...type.caps },
  pill: {
    alignSelf: "flex-start",
    borderRadius: radius.chip,
    borderWidth: StyleSheet.hairlineWidth * 2,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  pillText: { ...type.label, fontSize: 13, lineHeight: 18 },
  action: {
    minHeight: 48,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radius.control,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  actionPrimary: { backgroundColor: color.primary, borderColor: color.primary },
  actionSecondary: { backgroundColor: color.surface, borderColor: color.lineStrong },
  primaryPressed: { backgroundColor: color.primaryPress, borderColor: color.primaryPress },
  secondaryPressed: { backgroundColor: color.canvas },
  focused: { borderColor: color.ink, borderWidth: 2 },
  disabled: { opacity: 0.5 },
  actionText: { ...type.button, textAlign: "center", flexShrink: 1 },
  headerAction: { paddingVertical: 6, paddingHorizontal: 2 },
  headerActionText: { ...type.button, color: color.primary },
  input: {
    ...type.body,
    color: color.ink,
    minHeight: 48,
    backgroundColor: color.surface,
    borderColor: color.lineStrong,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  inputFocused: { borderColor: color.primary, borderWidth: 2, paddingHorizontal: 13, paddingVertical: 11 },
  inputDisabled: { backgroundColor: color.canvas, color: color.muted },
  segmented: {
    flexDirection: "row",
    backgroundColor: color.surface,
    borderColor: color.line,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderRadius: radius.control + 2,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.control - 2,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 8,
  },
  segmentSelected: { backgroundColor: color.primary },
  segmentPressed: { backgroundColor: color.canvas },
  segmentText: { ...type.button, fontSize: 15, color: color.muted },
  segmentTextSelected: { color: color.onPrimary },
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: color.scrim },
  sheet: {
    maxHeight: "88%",
    backgroundColor: color.canvas,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
  },
  grabber: {
    alignSelf: "center",
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: color.lineStrong,
    marginTop: 8,
  },
  sheetContent: { padding: space.page, paddingTop: 14, gap: space.gap, paddingBottom: 28 },
});
