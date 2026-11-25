import { AppState } from "react-native";
import { focusManager, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@biletflow/shared";
import { session } from "./session";
import { appStateToFocus } from "./query-client";

/** Refetch visible queries when the app returns to the foreground. Returns the unsubscribe. */
export function bindAppFocus(): () => void {
  focusManager.setEventListener((setFocused) => {
    const subscription = AppState.addEventListener("change", (state) =>
      setFocused(appStateToFocus(state)),
    );
    return () => subscription.remove();
  });
  return () => focusManager.setEventListener(() => () => undefined);
}

function requireSession() {
  if (!session) throw new ApiError(0, "not_configured", "EXPO_PUBLIC_API_ORIGIN is not set.");
  return session;
}

/** GET `path` through the signed-in session; the request is cancelled with the query. */
export function useAuthedQuery<T>(
  key: readonly unknown[],
  path: string,
  options: { enabled?: boolean } = {},
) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: ({ signal }) => requireSession().request<T>(path, { signal }),
    enabled: options.enabled ?? true,
  });
}

/** A write through the session; listed keys are invalidated once it settles. */
export function useAuthedMutation<T, V>(
  run: (vars: V, request: NonNullable<typeof session>["request"]) => Promise<T>,
  options: { invalidate?: readonly (readonly unknown[])[] } = {},
) {
  const client = useQueryClient();
  return useMutation<T, Error, V>({
    mutationFn: (vars) => {
      const current = requireSession();
      return run(vars, current.request.bind(current));
    },
    onSettled: () =>
      Promise.all(
        (options.invalidate ?? []).map((queryKey) => client.invalidateQueries({ queryKey })),
      ),
  });
}
