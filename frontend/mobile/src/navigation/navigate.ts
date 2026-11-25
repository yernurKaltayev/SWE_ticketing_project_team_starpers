import type { NativeTarget } from "./routes";

export type NavigationRequest =
  | { name: "Tabs"; params: { screen: "Tickets" } }
  | { name: "TicketDetail"; params: { ticketId: string; eventTitle: string | null } };

/**
 * Where a native target leads. A signed-out user is sent to the Tickets tab, which shows the
 * sign-in panel, instead of a ticket screen that cannot load.
 */
export function navigationFor(target: NativeTarget, signedIn: boolean): NavigationRequest {
  if (target.screen === "TicketDetail" && signedIn)
    return {
      name: "TicketDetail",
      params: { ticketId: target.params.ticketId, eventTitle: null },
    };
  return { name: "Tabs", params: { screen: "Tickets" } };
}
