const raw = import.meta.env.VITE_ENABLE_MOCKS;
if (raw && raw !== "true" && raw !== "false")
  throw new Error("VITE_ENABLE_MOCKS must be true or false.");
const apiOrigin = import.meta.env.VITE_API_ORIGIN || window.location.origin;
const parsed = new URL(apiOrigin);
if (
  !["http:", "https:"].includes(parsed.protocol) ||
  parsed.origin !== apiOrigin.replace(/\/$/, "")
) {
  throw new Error(
    "VITE_API_ORIGIN must be an HTTP(S) origin with no path or credentials.",
  );
}
export const config = {
  apiOrigin: parsed.origin,
  useMocks: import.meta.env.DEV && raw === "true",
};
