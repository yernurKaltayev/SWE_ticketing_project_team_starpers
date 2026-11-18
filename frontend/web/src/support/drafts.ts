import { useState } from "react";
import { useSession } from "../auth/session";
import type { Draft } from "./model";
type Session = ReturnType<typeof useSession>["controller"];
const stores = new WeakMap<Session, Map<string, Draft>>();
function vault(session: Session) {
  let map = stores.get(session);
  if (!map) {
    map = new Map();
    stores.set(session, map);
    let user = session.getSnapshot().user?.id;
    session.subscribe(() => {
      const next = session.getSnapshot().user?.id;
      if (next !== user) {
        map!.clear();
        user = next;
      }
    });
  }
  return map;
}
/** Text and uncertain-write state live only in this session's memory, never browser storage. */
export function useDraft(key: string, initial: Draft) {
  const { user, controller } = useSession();
  const map = vault(controller);
  const name = `${user?.id}:${key}`;
  const [draft, setState] = useState(() => map.get(name) ?? initial);
  return [
    draft,
    (next: Draft) => {
      if (map.size >= 50 && !map.has(name))
        map.delete(map.keys().next().value!);
      map.set(name, next);
      setState(next);
    },
  ] as const;
}
