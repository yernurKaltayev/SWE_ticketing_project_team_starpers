import type { Locale } from "@biletflow/shared";
import { zonedInput } from "@biletflow/shared/features/events/model";
import { label } from "@biletflow/shared/features/insights/copy";
import { DateTimeField } from "../kit/DateTimeField";

export type Range = { from: string | null; to: string | null };
export const emptyRange: Range = { from: null, to: null };
const defaultKeys = ["date_from", "date_to"] as const;
export const createdKeys = ["created_from", "created_to"] as const;

export function rangeParams(range: Range, zone: string, keys: readonly [string, string] = defaultKeys) {
  const result = new URLSearchParams();
  if (range.from) result.set(keys[0], zonedInput(range.from, zone));
  if (range.to) result.set(keys[1], zonedInput(range.to, zone));
  return result;
}

export function DateRange({ range, zone, locale, change, keys = defaultKeys }: {
  range: Range; zone: string; locale: Locale; change: (range: Range) => void; keys?: readonly [string, string];
}) {
  return <>
    <DateTimeField label={label(locale, keys[0])} locale={locale} zone={zone} value={range.from}
      onChange={(from) => change({ ...range, from })} />
    <DateTimeField label={label(locale, keys[1])} locale={locale} zone={zone} value={range.to}
      onChange={(to) => change({ ...range, to })} />
  </>;
}
