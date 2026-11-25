import { QueryClient } from "@tanstack/react-query";

/** One retry and a 30 s fresh window: check-in staff and attendees on mobile networks. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: 1, staleTime: 30_000, refetchOnWindowFocus: true },
      mutations: { retry: 0 },
    },
  });
}

export const queryClient = createQueryClient();

/** Called by the session on sign-out and expiry: no previous account's data survives. */
export function clearQueries(): void {
  queryClient.clear();
}

/** React Native AppState → TanStack focus: refetch only when the app is in the foreground. */
export function appStateToFocus(state: string): boolean {
  return state === "active";
}
