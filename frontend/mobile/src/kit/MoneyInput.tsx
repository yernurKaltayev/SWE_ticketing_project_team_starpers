import { useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import type { Locale } from "@biletflow/shared";
import { color, type } from "../theme";
import { Input } from "../ui";
import { kitCopy } from "./copy";
import { FormField } from "./FormField";
import { moneyText, moneyValue } from "./values";

/** KZT amount typed as text and reported in tiyn on blur; never rounded. */
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
  onChange: (amount: number | null) => void;
  error?: string | null;
  hint?: string;
  locale: Locale;
}) {
  const t = kitCopy[locale];
  const [text, setText] = useState(() => moneyText(amount));
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <FormField label={label} hint={hint} error={problem ?? error}>
      <View style={local.row}>
        <Input
          accessibilityLabel={label}
          value={text}
          onChangeText={(next) => {
            setText(next);
            if (problem) setProblem(null);
          }}
          onBlur={() => {
            const result = moneyValue(text);
            if (result.error) return setProblem(t.priceInvalid);
            setProblem(null);
            onChange(result.amount);
          }}
          keyboardType="decimal-pad"
          inputMode="decimal"
          style={[local.input, (problem ?? error) ? local.inputError : null]}
        />
        <Text style={local.currency} accessibilityElementsHidden>
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
