import { useEffect } from "react";
import type { ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { session, SessionContext } from "./session";
export function SessionProvider({ children }: { children: ReactNode }) {
  const cache = useQueryClient();
  useEffect(() => {
    let previous = session.getSnapshot().user?.id;
    const unsubscribe = session.subscribe(() => {
      const next = session.getSnapshot().user?.id;
      if (previous !== next) {
        void cache.cancelQueries();
        cache.clear();
      }
      previous = next;
    });
    void session.initialize().catch(() => {
      /* The service publishes signed-out recovery state. */
    });
    return unsubscribe;
  }, [cache]);
  return (
    <SessionContext.Provider value={session}>
      {children}
    </SessionContext.Provider>
  );
}
