import { useCallback, useEffect, useState } from "react";
import { useSession } from "../auth/session";
import type { ApiRequestOptions } from "@biletflow/shared";
import { api } from "../api";

export function useEventRequest() {
  const { user, controller } = useSession();
  return useCallback(
    <T>(path: string, options?: ApiRequestOptions) =>
      user
        ? controller.request<T>(path, options)
        : api.request<T>(path, options),
    [user, controller],
  );
}
export function useResource<T>(path: string) {
  const request = useEventRequest();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    path: string;
    version?: number;
    request?: typeof request;
    data?: T;
    error?: unknown;
  }>({ path: "" });
  useEffect(() => {
    if (!path) return;
    const abort = new AbortController();
    // The request identity below hides obsolete data without an effect-driven reset.
    void request<T>(path, { signal: abort.signal })
      .then((data) => {
        if (!abort.signal.aborted) setState({ path, version, request, data });
      })
      .catch((error) => {
        if (!abort.signal.aborted) setState({ path, version, request, error });
      });
    return () => abort.abort();
  }, [path, version, request]);
  const reload = useCallback(() => setVersion((n) => n + 1), []);
  return {
    ...(state.path === path &&
    state.version === version &&
    state.request === request
      ? state
      : { path }),
    reload,
  };
}
