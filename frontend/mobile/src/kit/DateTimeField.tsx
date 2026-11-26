import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerAndroid } from "@react-native-community/datetimepicker";
import { formatDateTime, zoneLabel } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { color, radius, type } from "../theme";
import { Action, Heading, Sheet } from "../ui";
import { kitCopy } from "./copy";
import { FormField } from "./FormField";
import { instantFromWall, isValidZone, pickerDateFromInstant, wallFromPicker } from "./values";

/**
 * Date and time in the event's own time zone. The device picker only supplies a wall clock;
 * it is converted with the shared event-zone rules, so a phone in another zone saves the same
 * instant the web would. Times that do not exist in the zone (DST gap) are refused.
 */
export function DateTimeField({
  label,
  zone,
  value,
  onChange,
  error,
  locale,
}: {
  label: string;
  zone: string;
  value: string | null;
  onChange: (iso: string | null) => void;
  error?: string | null;
  locale: Locale;
}) {
  const t = kitCopy[locale];
  const [problem, setProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<Date | null>(null);

  const zoneOk = isValidZone(zone);

  function commit(picked: Date) {
    const result = instantFromWall(wallFromPicker(picked), zone);
    if (result.error) return setProblem(t.dateInvalid);
    setProblem(null);
    onChange(result.iso);
  }

  function open() {
    if (!zoneOk) return;
    const start = pickerDateFromInstant(value, zone);
    if (Platform.OS === "android") {
      DateTimePickerAndroid.open({
        value: start,
        mode: "date",
        onChange: (event, date) => {
          if (event.type !== "set" || !date) return;
          DateTimePickerAndroid.open({
            value: date,
            mode: "time",
            is24Hour: true,
            onChange: (timeEvent, time) => {
              if (timeEvent.type === "set" && time) commit(time);
            },
          });
        },
      });
    } else setDraft(start);
  }

  // Without a usable zone nothing can be shown or saved correctly: ask for the zone first.
  const shown = !zoneOk
    ? t.zoneMissing
    : value
      ? formatDateTime(value, locale, { time: true, timeZone: zone })
      : t.pickDate;
  const hint = zoneOk ? zoneLabel(zone, locale) : undefined;
  return (
    <FormField label={label} hint={hint} error={problem ?? error}>
      <View style={local.row}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hint ? `${label}: ${shown}, ${hint}` : `${label}: ${shown}`}
          accessibilityState={{ disabled: !zoneOk }}
          disabled={!zoneOk}
          onPress={open}
          style={({ pressed }) => [
            local.field,
            (problem ?? error) ? local.fieldError : null,
            pressed && local.pressed,
          ]}
        >
          <Text style={[local.value, !value && local.placeholder]}>{shown}</Text>
        </Pressable>
        {value && zoneOk ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t.clear}: ${label}`}
            hitSlop={8}
            onPress={() => {
              setProblem(null);
              onChange(null);
            }}
            style={local.clear}
          >
            <Text style={local.clearText}>{t.clear}</Text>
          </Pressable>
        ) : null}
      </View>
      {Platform.OS === "ios" ? (
        <Sheet visible={draft !== null} onClose={() => setDraft(null)}>
          <Heading>{label}</Heading>
          {draft ? (
            <DateTimePicker
              value={draft}
              mode="datetime"
              display="inline"
              onChange={(_event, date) => date && setDraft(date)}
            />
          ) : null}
          <Action
            title={t.done}
            variant="primary"
            onPress={() => {
              if (draft) commit(draft);
              setDraft(null);
            }}
          />
          <Action title={t.cancel} onPress={() => setDraft(null)} />
        </Sheet>
      ) : null}
    </FormField>
  );
}

const local = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  field: {
    flex: 1,
    minHeight: 48,
    justifyContent: "center",
    backgroundColor: color.surface,
    borderColor: color.lineStrong,
    borderWidth: 1,
    borderRadius: radius.control,
    paddingHorizontal: 14,
  },
  fieldError: { borderColor: color.danger },
  pressed: { backgroundColor: color.canvas },
  value: { ...type.body, color: color.ink },
  placeholder: { color: color.muted },
  clear: { minHeight: 44, justifyContent: "center" },
  clearText: { ...type.button, color: color.primary },
});
