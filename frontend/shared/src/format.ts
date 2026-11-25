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

/**
 * A buyer-facing price: like formatMoney, but whole tenge drop the ",00" ("5 000 ₸").
 * Ledgers, payouts and admin tables keep formatMoney so every tiyn stays visible.
 */
export function formatPrice(
  amountTiyn: number,
  locale: Locale = "kk",
  currency = "KZT",
): string {
  const exact = formatMoney(amountTiyn, locale, currency);
  if (amountTiyn % 100 !== 0) return exact;
  return new Intl.NumberFormat(intlLocales[locale], {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amountTiyn / 100);
}

/** Kazakhstan's zones by city, so buyers read "Almaty" instead of "Asia/Almaty". */
const zoneCities: Record<string, Record<Locale, string>> = {
  "Asia/Almaty": { kk: "Алматы", ru: "Алматы", en: "Almaty" },
  "Asia/Qyzylorda": { kk: "Қызылорда", ru: "Кызылорда", en: "Kyzylorda" },
  "Asia/Qostanay": { kk: "Қостанай", ru: "Костанай", en: "Kostanay" },
  "Asia/Aqtobe": { kk: "Ақтөбе", ru: "Актобе", en: "Aktobe" },
  "Asia/Aqtau": { kk: "Ақтау", ru: "Актау", en: "Aktau" },
  "Asia/Atyrau": { kk: "Атырау", ru: "Атырау", en: "Atyrau" },
  "Asia/Oral": { kk: "Орал", ru: "Уральск", en: "Oral" },
};

/** The event zone as people say it: a city for Kazakhstan, the IANA id otherwise. */
export function zoneLabel(timeZone: string, locale: Locale): string {
  return zoneCities[timeZone]?.[locale] ?? timeZone;
}

/** CLDR abbreviated Kazakh month names, as full-ICU engines print them. */
const kazakhMonths = [
  "қаң.",
  "ақп.",
  "нау.",
  "сәу.",
  "мам.",
  "мау.",
  "шіл.",
  "там.",
  "қыр.",
  "қаз.",
  "қар.",
  "жел.",
];

export interface DateTimeOptions {
  /** Add hours and minutes (24-hour). */
  time?: boolean;
  /** IANA zone to show the moment in; the device zone when omitted. */
  timeZone?: string;
  /** Append the short zone name, e.g. "GMT+5". */
  zoneName?: boolean;
}

/**
 * A date (and optionally time) in the interface language. Chrome and Hermes ship no
 * Kazakh calendar data and print "2027 M03 1", so Kazakh is composed from numeric parts
 * in the CLDR pattern full-ICU engines use: "2027 ж. 1 нау., 19:00".
 */
export function formatDateTime(
  value: string | Date,
  locale: Locale,
  { time = false, timeZone, zoneName = false }: DateTimeOptions = {},
): string {
  const date = value instanceof Date ? value : new Date(value);
  const zone = zoneName ? ({ timeZoneName: "short" } as const) : {};
  const clock = time ? ({ hour: "2-digit", minute: "2-digit" } as const) : {};
  if (locale !== "kk")
    return new Intl.DateTimeFormat(intlLocales[locale], {
      year: "numeric",
      month: "short",
      day: "numeric",
      ...clock,
      ...zone,
      timeZone,
    }).format(date);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      ...clock,
      hourCycle: "h23",
      ...zone,
      timeZone,
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  const day = `${parts.year} ж. ${Number(parts.day)} ${kazakhMonths[Number(parts.month) - 1]}`;
  const clockText = time ? `, ${parts.hour}:${parts.minute}` : "";
  const zoneText = zoneName && parts.timeZoneName ? ` ${parts.timeZoneName}` : "";
  return `${day}${clockText}${zoneText}`;
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
  const formatted = formatDateTime(date, locale, { time: true, timeZone, zoneName: true });
  return `${formatted} · ${zoneLabel(timeZone, locale)}`;
}
