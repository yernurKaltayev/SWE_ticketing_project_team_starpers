import { useCallback, useEffect, useState } from "react";
import { parseSeatMap } from "./model";
import type { Request, SeatMap } from "./model";

/** Uses the same injected transport for reads and writes. Obsolete responses cannot
 * replace a new user's map; interval refresh retains the last read while loading. */
export function useSeatMap(eventId: string, request: Request) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState<{
    request?: Request;
    eventId?: string;
    data?: SeatMap;
    error?: unknown;
    loading: boolean;
  }>({ loading: true });
  const reload = useCallback(() => setRevision((n) => n + 1), []);
  useEffect(() => {
    const abort = new AbortController();
    // Synchronize the read lifecycle; retain a snapshot only for the same identity.
    // oxlint-disable-next-line react/set-state-in-effect
    setState((old) => ({
      request,
      eventId,
      loading: true,
      data:
        old.request === request && old.eventId === eventId
          ? old.data
          : undefined,
    }));
    void request(`/api/v1/events/${encodeURIComponent(eventId)}/seat-map`, {
      signal: abort.signal,
    })
      .then(parseSeatMap)
      .then((data) => {
        if (data.event_id !== eventId) throw new Error("invalid_event");
        if (!abort.signal.aborted)
          setState({ request, eventId, data, loading: false });
      })
      .catch((error) => {
        if (!abort.signal.aborted)
          setState({ request, eventId, error, loading: false });
      });
    return () => abort.abort();
  }, [eventId, request, revision]);
  return {
    ...(state.request === request && state.eventId === eventId
      ? state
      : { loading: true }),
    reload,
  };
}
