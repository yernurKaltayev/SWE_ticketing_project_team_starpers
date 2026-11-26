import type { FeatureName, FeatureParams } from "./features";
import type { NavigatorScreenParams } from "@react-navigation/native";
import type { DiscoveryParams } from "../events/discovery-filters";
import type { AuthParams, AuthScreenName } from "./auth-routes";

export type TabScreens = {
  Discover: DiscoveryParams | undefined;
  Tickets: undefined;
  Home: undefined;
  Account: undefined;
};

export type Screens = Record<AuthScreenName, AuthParams | undefined> & Record<FeatureName, FeatureParams | undefined> & {
  Tabs: NavigatorScreenParams<TabScreens> | undefined;
  TicketDetail: { ticketId: string; eventTitle?: string | null };
  CheckIn: { eventId: string; title: string };
  Settings: undefined;
  Connection: undefined;
  KitGallery: undefined;
};
