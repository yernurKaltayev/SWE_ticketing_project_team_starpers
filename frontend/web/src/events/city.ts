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

const MANUAL = "biletflow.city.manual";
const ASKED = "biletflow.city.located";

/** True once the visitor picked a city by hand; location then never overrides it. */
export function cityChosenByHand(): boolean {
  try {
    return localStorage.getItem(MANUAL) === "1";
  } catch {
    return false;
  }
}
export function markCityChosenByHand() {
  try {
    localStorage.setItem(MANUAL, "1");
  } catch {
    // Storage blocked: the choice still lives in the URL.
  }
}
/** Location is asked once per visit (browser session), not on every page. */
export function locatedThisVisit(): boolean {
  try {
    if (sessionStorage.getItem(ASKED)) return true;
    sessionStorage.setItem(ASKED, "1");
    return false;
  } catch {
    return false;
  }
}
