import { createContext, useContext, useSyncExternalStore } from "react";
import { createSession } from "@biletflow/shared";
import type { CookieSession } from "@biletflow/shared";
import { config } from "../config";
import { tokenStore } from "../api";

/** The API sets an HttpOnly refresh cookie plus this readable marker, so a reload
 * can restore the session without page scripts ever seeing the refresh token. */
export const cookieSession: CookieSession = {
  present: () =>
    document.cookie
      .split(";")
      .some((part) => part.trim().startsWith("biletflow_session=")),
  // Without Web Locks (very old browsers) refreshes are still deduplicated per tab.
  lock: <T>(run: () => Promise<T>) =>
    typeof navigator !== "undefined" && navigator.locks
      ? navigator.locks.request("biletflow.auth.refresh", run)
      : run(),
};

export const session = createSession({
  baseUrl: config.apiOrigin,
  tokenStore,
  cookieSession,
});
export const SessionContext = createContext(session);

export function useSession() {
  const controller = useContext(SessionContext);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  return { ...snapshot, controller };
}
