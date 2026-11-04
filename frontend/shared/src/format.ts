import { intlLocales, type Locale } from "./locales";

/** Formats exact integer tiyn without floating-point monetary arithmetic. */
export function formatMoney(
  amountTiyn: number,
  locale: Locale = "kk",
  currency = "KZT",
): string {
  if (!Number.isSafeInteger(amountTiyn))
    throw new RangeError("Money must be safe integer tiyn.");
  if (currency !== "KZT")
    throw new RangeError("Only KZT minor-unit formatting is defined.");
  const minor = BigInt(amountTiyn);
  const absolute = minor < 0n ? -minor : minor;
  const major = absolute / 100n;
  const signedMajor = minor < 0n ? (major === 0n ? -0 : -major) : major;
  const fraction = String(absolute % 100n).padStart(2, "0");
  return new Intl.NumberFormat(intlLocales[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .formatToParts(signedMajor)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

/** Requires an absolute timestamp and the event's explicit IANA time zone. */
export function formatEventDateTime(
  value: string | Date,
  timeZone: string,
  locale: Locale = "kk",
): string {
  if (!timeZone.trim())
    throw new RangeError("An explicit event time zone is required.");
  if (typeof value === "string" && !/(?:Z|[+-]\d{2}:\d{2})$/i.test(value)) {
    throw new RangeError("Timestamp must include a UTC offset.");
  }
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime()))
    throw new RangeError("Timestamp is invalid.");
  const formatted = new Intl.DateTimeFormat(intlLocales[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
    timeZoneName: "short",
  }).format(date);
  return `${formatted} · ${timeZone}`;
}
