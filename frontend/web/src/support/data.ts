import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@biletflow/shared";
import { useSession } from "../auth/session";
export function useVisible() {
  const [active, setActive] = useState(
    () => document.visibilityState !== "hidden" && navigator.onLine !== false,
  );
  useEffect(() => {
    const update = () =>
      setActive(
        document.visibilityState !== "hidden" && navigator.onLine !== false,
      );
    document.addEventListener("visibilitychange", update);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    window.addEventListener("focus", update);
    return () => {
      document.removeEventListener("visibilitychange", update);
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
      window.removeEventListener("focus", update);
    };
  }, []);
  return active;
}
export function retryRead(count: number, error: unknown) {
  return (
    count < 2 &&
    !(
      error instanceof ApiError &&
      error.status >= 400 &&
      error.status < 500 &&
      ![408, 429].includes(error.status)
    )
  );
}
export function readDelay(attempt: number, error?: unknown) {
  if (error instanceof ApiError && error.status === 429 && error.retryAfter) {
    const seconds = Number(error.retryAfter);
    const delay = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(error.retryAfter) - Date.now();
    if (Number.isFinite(delay)) return Math.max(1000, Math.min(delay, 60000));
  }
  return Math.min(1000 * 2 ** attempt, 15000);
}
export function useLiveQuery<T>(
  path: string,
  parse: (v: unknown) => T,
  interval = 10000,
  enabled = true,
) {
  const { user, controller } = useSession();
  const visible = useVisible();
  const query = useQuery({
    queryKey: ["f9", user?.id, path],
    queryFn: async ({ signal }) =>
      parse(await controller.request(path, { signal })),
    enabled: !!user && visible && enabled && !!path,
    retry: retryRead,
    retryDelay: readDelay,
    refetchInterval: (query) =>
      query.state.status === "error" ? false : interval,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
  });
  useResume(query.refetch, !!user && enabled && !!path);
  return query;
}
export function useResume(
  reload: (options?: { cancelRefetch?: boolean }) => Promise<unknown>,
  enabled: boolean,
) {
  useEffect(() => {
    const resume = () => {
      if (
        enabled &&
        document.visibilityState !== "hidden" &&
        navigator.onLine !== false
      )
        void reload({ cancelRefetch: false });
    };
    window.addEventListener("focus", resume);
    return () => window.removeEventListener("focus", resume);
  }, [reload, enabled]);
}
