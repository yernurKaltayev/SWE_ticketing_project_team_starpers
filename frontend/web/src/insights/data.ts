import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/session";
import { useVisible, useResume, retryRead, readDelay } from "../support/data";
import { definiteFailure } from "../support/model";
import { allEvents } from "./model";
type Session = ReturnType<typeof useSession>["controller"];
const unknowns = new WeakMap<Session, Set<string>>();
function journal(s: Session) {
  let set = unknowns.get(s);
  if (!set) {
    set = new Set();
    unknowns.set(s, set);
    let id = s.getSnapshot().user?.id;
    s.subscribe(() => {
      const next = s.getSnapshot().user?.id;
      if (id !== next) {
        set!.clear();
        id = next;
      }
    });
  }
  return set;
}
export function useWriteScope(scope: string) {
  const {
    user,
    controller
  } = useSession();
  const log = journal(controller),
    key = `${user?.id}:${scope}`;
  const [uncertain, setUncertain] = useState(() => log.has(key)),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [saved, setSaved] = useState(false);
  const lock = useRef(false);
  async function run<T>(path: string, body: unknown, method: string, parse: (v: unknown) => T): Promise<T | undefined> {
    if (lock.current || log.has(key) || !user) return;
    const owner = user.id;
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setSaved(false);
    try {
      const value = parse(await controller.request(path, {
        method,
        body
      }));
      if (controller.getSnapshot().user?.id !== owner) return;
      setSaved(true);
      return value;
    } catch (e) {
      if (controller.getSnapshot().user?.id === owner) {
        setError(e);
        if (!definiteFailure(e)) {
          log.add(key);
          setUncertain(true);
        }
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return {
    run,
    busy,
    error,
    saved,
    uncertain,
    acknowledge: () => {
      log.delete(key);
      setUncertain(false);
      setError(undefined);
    }
  };
}
export function useOwnedEvents() {
  const {
      user,
      controller
    } = useSession(),
    visible = useVisible();
  const query = useQuery({
    queryKey: ["f10", user?.id, "owned-events"],
    enabled: user?.role === "organizer" && visible,
    queryFn: ({
      signal
    }) => allEvents(controller.request, signal),
    retry: retryRead,
    retryDelay: readDelay,
    refetchOnWindowFocus: true
  });
  useResume(query.refetch, user?.role === "organizer");
  return query;
}
