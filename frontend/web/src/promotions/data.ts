import { useEffect, useState } from "react";
import { useEventRequest } from "../events/data";
import { parseTicketTypes } from "../events/contracts";
import type { Ticket } from "../events/model";
import type { Request } from "./model";
/** P3 returns an array. Older fixtures/pages are normalized without losing eligibility options. */
export async function loadCampaignTypes(
  request: Request,
  path: string,
  signal?: AbortSignal,
) {
  const items: Ticket[] = [];
  const ids = new Set<string>();
  let offset = 0;
  for (let n = 0; n < 100; n++) {
    const raw = await request(`${path}?limit=100&offset=${offset}`, { signal });
    const page = parseTicketTypes(raw);
    if (
      page.total > 10000 ||
      page.offset !== offset ||
      (!page.items.length && offset < page.total)
    )
      throw new Error("invalid_ticket_types");
    for (const row of page.items) {
      if (ids.has(row.id)) throw new Error("duplicate_ticket_type");
      ids.add(row.id);
      items.push(row);
    }
    offset += page.items.length;
    if (offset >= page.total) return { items };
  }
  throw new Error("ticket_type_limit");
}
export function useCampaignTypes(path: string) {
  const request = useEventRequest();
  const [version, setVersion] = useState(0);
  const [state, setState] = useState<{
    key: string;
    request?: Request;
    data?: { items: Ticket[] };
    error?: unknown;
  }>({ key: "" });
  const key = JSON.stringify([path, version]);
  useEffect(() => {
    const abort = new AbortController();
    void loadCampaignTypes(request, path, abort.signal)
      .then((data) => {
        if (!abort.signal.aborted) setState({ key, request, data });
      })
      .catch((error) => {
        if (!abort.signal.aborted) setState({ key, request, error });
      });
    return () => abort.abort();
  }, [path, request, key]);
  return {
    ...(state.key === key && state.request === request ? state : { key }),
    reload: () => setVersion((n) => n + 1),
  };
}
