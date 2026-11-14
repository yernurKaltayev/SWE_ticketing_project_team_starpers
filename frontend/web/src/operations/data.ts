import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { useSession } from "../auth/session";
import type { Request } from "./model";
export function useOperationsQuery<T>(
  path: string,
  parse: (v: unknown) => T,
  enabled = true,
) {
  const { user, controller } = useSession();
  return useQuery({
    queryKey: ["f6", user?.id, path],
    enabled: !!user && enabled && !!path,
    retry: false,
    queryFn: async ({ signal }) =>
      parse(await controller.request(path, { signal })),
  });
}
export function useOrderSnapshot(
  eventId: string,
  load: (
    request: Request,
    eventId: string,
    signal?: AbortSignal,
  ) => Promise<import("./model").Order[]>,
) {
  const { user, controller } = useSession();
  return useQuery({
    queryKey: ["f6", user?.id, eventId, "orders"],
    enabled: !!user,
    retry: false,
    queryFn: ({ signal }) => load(controller.request, eventId, signal),
  });
}
/** Reset affected caches, including active QR data, before refetch. SessionProvider
 * already clears all query data on account change. No mutation writes optimistic state. */
export function useRefreshOperations() {
  const client = useQueryClient();
  return useCallback(async () => {
    const filter = {
      predicate: (q: { queryKey: readonly unknown[] }) =>
        ["f6", "f3", "f3-qr", "f4"].includes(String(q.queryKey[0])),
    };
    await client.cancelQueries(filter);
    await client.resetQueries(filter);
  }, [client]);
}
export function downloadCsv(blob: Blob, filename: string) {
  if (!blob.type.toLowerCase().includes("text/csv") || blob.size === 0)
    throw new Error("invalid_csv");
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
