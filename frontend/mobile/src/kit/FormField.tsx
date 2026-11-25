import type { ReactNode } from "react";
import { StyleSheet, Text, View } from "react-native";
import { color, type } from "../theme";

/** Label, control, then hint or error. The error is announced when it appears. */
export function FormField({
  label,
  hint,
  error,
  nativeID,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  nativeID?: string;
  children: ReactNode;
}) {
  return (
    <View style={local.field}>
      <Text nativeID={nativeID} style={local.label}>
        {label}
      </Text>
      {children}
      {error ? (
        <Text accessibilityLiveRegion="polite" style={local.error}>
          {error}
        </Text>
      ) : hint ? (
        <Text style={local.hint}>{hint}</Text>
      ) : null}
    </View>
  );
}

const local = StyleSheet.create({
  field: { gap: 6 },
  label: { ...type.label, color: color.ink },
  hint: { ...type.small, color: color.muted },
  error: { ...type.small, color: color.danger },
});
