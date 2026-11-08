import { useQueries, useQuery } from "@tanstack/react-query";
import { useSession } from "../auth/session";
import type { ApiRequestOptions } from "@biletflow/shared";
import { parseAvailability, parseOrder, parsePage, parseTicket } from "./model";
import { useSearchParams } from "react-router-dom";
import { parseEvent } from "./model";

/** Ticket rows share one parallel, account-scoped query per distinct event. */
export function useTicketEvents(eventIds: string[]) {
  const { user, controller } = useSession();
  const unique = [...new Set(eventIds)];
  const queries = useQueries({
    queries: unique.map((id) => ({
      queryKey: ["f3", user?.id, eventPath(id)],
      queryFn: async ({ signal }: { signal: AbortSignal }) =>
        parseEvent(await controller.request(eventPath(id), { signal })),
      enabled: !!user,
      retry: false,
    })),
  });
  return new Map(unique.map((id, i) => [id, queries[i]]));
}

export function usePagination() {
  const [params, setParams] = useSearchParams();
  const raw = params.get("offset") ?? "0";
  const offset =
    /^\d+$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : 0;
  return {
    offset,
    change: (value: number) =>
      setParams({ offset: String(Math.max(0, value)) }),
  };
}

export function useCommerceQuery<T>(
  path: string,
  parse: (value: unknown) => T,
  enabled = true,
) {
  const { user, controller } = useSession();
  return useQuery({
    queryKey: ["f3", user?.id, path],
    queryFn: async ({ signal }) =>
      parse(await controller.request(path, { signal })),
    enabled: !!user && enabled && !!path,
    retry: false,
  });
}
export const eventPath = (id: string) =>
  `/api/v1/events/${encodeURIComponent(id)}`;
export const orderPath = (id: string) =>
  `/api/v1/orders/${encodeURIComponent(id)}`;
export const ticketDetailPath = (id: string) =>
  `/api/v1/tickets/${encodeURIComponent(id)}`;
export const parseOrders = (v: unknown) => parsePage(v, parseOrder);
export const parseTickets = (v: unknown) => parsePage(v, parseTicket);
export { parseAvailability, parseOrder, parseTicket };
export { parseEvent } from "./model";
export type CommerceRequest = <T>(
  path: string,
  options?: ApiRequestOptions,
) => Promise<T>;
