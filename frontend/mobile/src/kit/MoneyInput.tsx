import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Locale } from "@biletflow/shared";
import { color, type } from "../theme";
import { Input } from "../ui";
import { kitCopy } from "./copy";
import { FormField } from "./FormField";
import { moneyText, moneyValue, syncedMoneyText } from "./values";

/**
 * KZT amount typed as text, reported in tiyn on every change (never rounded), so a Save tapped
 * while the field is focused sees the current value. `invalid` tells the form to refuse saving;
 * the inline error appears once the field loses focus.
 */
export function MoneyInput({
  label,
  amount,
  onChange,
  error,
  hint,
  locale,
}: {
  label: string;
  amount: number | null;
  onChange: (amount: number | null, invalid: boolean) => void;
  error?: string | null;
  hint?: string;
  locale: Locale;
}) {
  const t = kitCopy[locale];
  const [text, setText] = useState(() => moneyText(amount));
  const [problem, setProblem] = useState<string | null>(null);
  // The last amount this field reported. A different `amount` came from the form (loaded record,
  // reset) and replaces the text; the field's own reports never overwrite what the user typed.
  const reported = useRef(amount);
  useEffect(() => {
    if (amount === reported.current) return;
    reported.current = amount;
    setText((current) => syncedMoneyText(current, amount));
  }, [amount]);
  return (
    <FormField label={label} hint={hint} error={problem ?? error}>
      <View style={local.row}>
        <Input
          accessibilityLabel={`${label}, ₸`}
          value={text}
          onChangeText={(next) => {
            setText(next);
            const result = moneyValue(next);
            if (!result.error && problem) setProblem(null);
            reported.current = result.amount;
            onChange(result.amount, result.error !== null);
          }}
          onBlur={() => {
            setProblem(moneyValue(text).error ? t.priceInvalid : null);
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={[local.input, (problem ?? error) ? local.inputError : null]}
        />
        <Text style={local.currency} accessibilityElementsHidden importantForAccessibility="no">
          ₸
        </Text>
      </View>
    </FormField>
  );
}

const local = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: { flex: 1, fontVariant: ["tabular-nums"] },
  inputError: { borderColor: color.danger },
  currency: { ...type.bodyStrong, color: color.muted },
});
