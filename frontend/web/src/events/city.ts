/** The buyer's last chosen city, remembered per browser like other site preferences. */
const KEY = "biletflow.city";

export function readCity(): string {
  try {
    return localStorage.getItem(KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeCity(city: string) {
  try {
    if (city) localStorage.setItem(KEY, city);
    else localStorage.removeItem(KEY);
  } catch {
    // Storage blocked (private mode): the URL still carries the choice.
  }
}
