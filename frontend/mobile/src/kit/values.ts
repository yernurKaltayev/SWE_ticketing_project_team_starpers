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

/** A device-local Date showing the event's wall time, so the picker opens on it. */
export function pickerDateFromInstant(iso: string | null, zone: string): Date {
  if (!iso) {
    const next = new Date();
    next.setMinutes(0, 0, 0);
    next.setHours(next.getHours() + 1);
    return next;
  }
  const [date, time] = zonedInput(iso, zone).split("T");
  const [y, m, d] = date!.split("-").map(Number);
  const [h, min] = time!.split(":").map(Number);
  return new Date(y!, m! - 1, d!, h!, min!);
}
