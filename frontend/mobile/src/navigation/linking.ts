import { nativeRoutes } from "./routes";
import type { NativeTarget } from "./routes";
import type { Screens, TabScreens } from "./params";

/** Native targets that live inside the bottom tabs rather than on the root stack. */
const tabScreens = new Set<string>(["Tickets", "Account", "Discover"]);
function isTab(screen: NativeTarget["screen"]): screen is Extract<NativeTarget["screen"], keyof TabScreens> {
  return tabScreens.has(screen);
}

type ScreenPath = string | { path: string; alias: string[] };
type TabPaths = { screens: Record<string, ScreenPath> };
type LinkingConfig = {
  initialRouteName: "Tabs";
  screens: { Tabs: TabPaths } & Partial<Record<Exclude<keyof Screens, "Tabs">, ScreenPath>>;
};

/**
 * React Navigation deep-link config derived from the route map, so a deep link
 * (exp://<host>/--/account/tickets in Expo Go) opens the same screen as the corresponding website path.
 */
export function linkingConfig(): LinkingConfig {
  // Tabs sits under every deep-linked screen, so a cold-start link still has a way back.
  const config: LinkingConfig = { initialRouteName: "Tabs", screens: { Tabs: { screens: {} } } };
  for (const route of nativeRoutes) {
    const params = Object.fromEntries(
      route.pattern
        .split("/")
        .filter((part) => part.startsWith(":"))
        .map((part) => [part.slice(1), part]),
    );
    const { screen } = route.to(params, new URLSearchParams());
    const path = route.pattern.replace(/^\//, "");
    if (isTab(screen)) addPath(config.screens.Tabs.screens, screen, path);
    else addPath(config.screens, screen, path);
  }
  return config;
}

function addPath<K extends string>(screens: Partial<Record<K, ScreenPath>>, name: K, path: string) {
  const previous = screens[name];
  if (typeof previous === "string") screens[name] = { path: previous, alias: [path] };
  else if (previous) previous.alias.push(path);
  else screens[name] = path;
}
