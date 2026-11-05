import { createContext, useContext, useSyncExternalStore } from "react";
import { createSession } from "@biletflow/shared";
import { config } from "../config";
import { tokenStore } from "../api";

export const session = createSession({ baseUrl: config.apiOrigin, tokenStore });
export const SessionContext = createContext(session);

export function useSession() {
  const controller = useContext(SessionContext);
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
  );
  return { ...snapshot, controller };
}
