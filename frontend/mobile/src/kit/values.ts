import { InputError, parsePrice, priceInput, toInstant, zonedInput } from "@biletflow/shared/features/events/model";

/** KZT text → tiyn. Empty is "no amount"; anything not exactly representable is an error. */
export function moneyValue(text: string): { amount: number | null; error: "price" | null } {
  const compact = text.trim().replace(/(\d)[\s  ]+(?=\d)/g, "$1");
  if (!compact) return { amount: null, error: null };
  try {
    return { amount: parsePrice(compact), error: null };
  } catch {
    return { amount: null, error: "price" };
  }
}

export function moneyText(amount: number | null): string {
  return amount === null ? "" : priceInput(amount);
}

/** Text to show for an amount set from outside: keep the user's text if it means the same. */
export function syncedMoneyText(text: string, amount: number | null): string {
  const current = moneyValue(text);
  return !current.error && current.amount === amount ? text : moneyText(amount);
}

/** Whether `zone` is an IANA zone this device's Intl can format in. */
export function isValidZone(zone: string): boolean {
  if (!zone) return false;
  try {
    new Intl.DateTimeFormat("en", { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

const two = (n: number) => String(n).padStart(2, "0");

/** The picker works in device time; only its wall clock is used. */
export function wallFromPicker(date: Date): string {
  return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}T${two(date.getHours())}:${two(date.getMinutes())}`;
}

/** A wall time in the event's zone → ISO instant, rejecting DST gaps and overlaps. */
export function instantFromWall(wall: string, zone: string): { iso: string | null; error: "date" | null } {
  try {
    return { iso: toInstant(wall, zone, "date"), error: null };
  } catch (error) {
    if (error instanceof InputError) return { iso: null, error: "date" };
    throw error;
  }
}

/** A device-local Date for a `YYYY-MM-DDTHH:mm` wall time, or null when it is malformed. */
export function pickerDateFromWall(wall: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(wall);
  if (!match) return null;
  const [y, m, d, h, min] = match.slice(1).map(Number) as [number, number, number, number, number];
  if (m < 1 || m > 12 || d < 1 || d > 31 || h > 23 || min > 59) return null;
  return new Date(y, m - 1, d, h, min);
}

function nextHour(): Date {
  const next = new Date();
  next.setMinutes(0, 0, 0);
  next.setHours(next.getHours() + 1);
  return next;
}

/**
 * A device-local Date showing the event's wall time, so the picker opens on it. If the
 * engine's Intl cannot produce a clean wall time, the picker opens on the next hour instead
 * of a wrong day; saving still goes through the strict `toInstant` check.
 */
export function pickerDateFromInstant(iso: string | null, zone: string): Date {
  if (!iso) return nextHour();
  try {
    return pickerDateFromWall(zonedInput(iso, zone)) ?? nextHour();
  } catch {
    return nextHour();
  }
}
