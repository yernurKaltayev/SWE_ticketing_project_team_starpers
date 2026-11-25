import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Locale } from "@biletflow/shared";
import { color, radius, type } from "../theme";
import { Action, Heading, Sheet } from "../ui";
import { kitCopy } from "./copy";
import { FormField } from "./FormField";

/** A field that opens a bottom sheet with one choice per row. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  placeholder,
  error,
  locale,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  placeholder?: string;
  error?: string | null;
  locale: Locale;
}) {
  const t = kitCopy[locale];
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value);
  return (
    <FormField label={label} error={error}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${current?.label ?? placeholder ?? t.choose}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [local.field, error ? local.fieldError : null, pressed && local.pressed]}
      >
        <Text style={[local.value, !current && local.placeholder]} numberOfLines={1}>
          {current?.label ?? placeholder ?? t.choose}
        </Text>
        <Text style={local.chevron} accessibilityElementsHidden>
          ▾
        </Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)}>
        <Heading>{label}</Heading>
        <View accessibilityRole="radiogroup" style={local.list}>
          {options.map((option) => {
            const selected = option.value === value;
            return (
              <Pressable
                key={option.value}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={option.label}
                onPress={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
                style={({ pressed }) => [local.row, selected && local.rowSelected, pressed && local.pressed]}
              >
                <Text style={[local.rowText, selected && local.rowTextSelected]}>{option.label}</Text>
                {selected ? <Text style={local.check}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
        <Action title={t.close} onPress={() => setOpen(false)} />
      </Sheet>
    </FormField>
  );
}

const local = StyleSheet.create({
  field: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: color.surface,
    borderColor: color.lineStrong,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
  },
  fieldError: { borderColor: color.danger },
  pressed: { backgroundColor: color.canvas },
  value: { ...type.body, color: color.ink, flex: 1 },
  placeholder: { color: color.muted },
  chevron: { ...type.body, color: color.muted },
  list: { gap: 4 },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    borderRadius: radius.control,
    backgroundColor: color.surface,
  },
  rowSelected: { backgroundColor: color.primarySoft },
  rowText: { ...type.body, color: color.ink, flex: 1 },
  rowTextSelected: { ...type.bodyStrong, color: color.primary },
  check: { ...type.bodyStrong, color: color.primary },
});
