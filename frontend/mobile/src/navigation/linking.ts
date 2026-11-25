import { nativeRoutes } from "./routes";
import type { NativeTarget } from "./routes";

/** Native targets that live inside the bottom tabs rather than on the root stack. */
const tabScreens = new Set<NativeTarget["screen"]>(["Tickets"]);

type LinkingConfig = {
  screens: { Tabs: { screens: Record<string, string> } } & Record<string, unknown>;
};

/**
 * React Navigation deep-link config derived from the route map, so a deep link
 * (exp://<host>/--/account/tickets in Expo Go) opens the same screen as a web-tab link.
 */
export function linkingConfig(): LinkingConfig {
  const config: LinkingConfig = { screens: { Tabs: { screens: {} } } };
  for (const route of nativeRoutes) {
    const params = Object.fromEntries(
      route.pattern
        .split("/")
        .filter((part) => part.startsWith(":"))
        .map((part) => [part.slice(1), part]),
    );
    const { screen } = route.to(params);
    const path = route.pattern.slice(1);
    if (tabScreens.has(screen)) config.screens.Tabs.screens[screen] = path;
    else config.screens[screen] = path;
  }
  return config;
}
