import type { FeatureName, FeatureParams } from "./features";
import type { NativeTarget } from "./routes";
import type { DiscoveryParams } from "../events/discovery-filters";
import type { AuthParams, AuthScreenName } from "./auth-routes";

export type NavigationRequest =
  | { name: "Tabs"; params: { screen: "Tickets" | "Account" } }
  | { name: "Tabs"; params: { screen: "Discover"; params: DiscoveryParams } }
  | { name: "TicketDetail"; params: { ticketId: string; eventTitle: string | null } }
  | { name: FeatureName | AuthScreenName; params: FeatureParams | AuthParams };

/** Keep protected destinations on the stack so they can render sign-in in place. */
export function navigationFor(target: NativeTarget): NavigationRequest {
  if (target.screen === "Tickets" || target.screen === "Account")
    return { name: "Tabs", params: { screen: target.screen } };
  if (target.screen === "Discover")
    return { name: "Tabs", params: { screen: "Discover", params: target.params } };
  if (target.screen === "TicketDetail")
    return { name: "TicketDetail", params: { ...target.params, eventTitle: null } };
  return { name: target.screen, params: target.params };
}
