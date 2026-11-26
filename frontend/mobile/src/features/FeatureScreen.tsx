import { KitGallery } from "../kit/Gallery";
import { DevSeating } from "../seating/DevSeating";
import { Action, Title } from "../ui";
import { Admin } from "../admin/Admin";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { organizerFeatures } from "../navigation/features";
import { EventEditor, OrganizerEvents } from "../organizer/Events";
import { OrganizerProfile, Staff } from "../organizer/People";
import { Seating } from "../organizer/Seating";
import { Campaigns } from "../organizer/Campaigns";
import { Operations } from "../organizer/Operations";
import { Accounts, Activation, Financials, Payouts } from "../organizer/Finances";
import { Insights } from "../organizer/Insights";
import { Callout } from "../ui";
import type { Locale } from "@biletflow/shared";
import type { FeatureName, FeatureParams } from "../navigation/features";
import type { AuthParams, AuthScreenName } from "../navigation/auth-routes";
import { EventDetail } from "../events/EventDetail";
import { Checkout, Seats } from "../checkout/Checkout";
import { Order, Orders } from "../checkout/Orders";
import { NewCase, Notifications, Support, Thread } from "../support/Screens";
import { useSessionSnapshot } from "../session";
import SessionPanel from "../SessionPanel";
import { Screen } from "../ui";

export function FeatureScreen({ name, params, locale, open, openAuth }: {
  name: FeatureName; params?: FeatureParams; locale: Locale;
  open: (path: string) => void;
  openAuth: (screen: AuthScreenName, params?: AuthParams) => void;
}) {
  const { user } = useSessionSnapshot();
  const search = new URLSearchParams();
  for (const key of ["promo", "promo_status", "share", "event_id", "order_id", "ticket_id"] as const) {
    const value = params?.[key];
    if (typeof value === "string" && value) search.set(key, value);
  }
  const query = search.size ? `?${search}` : "";
  const eventId = typeof params?.eventId === "string" ? params.eventId : "";
  const orderId = typeof params?.orderId === "string" ? params.orderId : "";
  if (name === "NotFound" || (!__DEV__ && (name === "DevFoundation" || name === "DevSeating"))) {
    return <Screen>
      <Title>{authCopy[locale].notFound}</Title>
      <Action title={authCopy[locale].home} onPress={() => open("/")} />
    </Screen>;
  }
  if (name === "DevFoundation") return <KitGallery locale={locale} />;
  if (name === "DevSeating") return <DevSeating locale={locale} />;
  if (name === "Event") return <EventDetail id={eventId} locale={locale} search={query} open={open} />;
  if (!user) return <Screen><SessionPanel locale={locale} onNavigate={openAuth} confirmDiscard /></Screen>;
  if ((organizerFeatures.has(name) && user.role !== "organizer") || ((name === "Admin" || name === "AdminUnavailable") && user.role !== "platform_admin"))
    return <Screen><Callout tone="danger">{authCopy[locale].forbidden}</Callout></Screen>;
  if (name === "OrganizerUnavailable" || name === "AdminUnavailable") {
    return <Screen><Title>{authCopy[locale].unavailable}</Title></Screen>;
  }
  const scope = { locale, open };
  switch (name) {
    case "Seats": return <Seats id={eventId} search={query} {...scope} />;
    case "Checkout": return <Checkout id={eventId} search={query} {...scope} />;
    case "Orders": return <Orders {...scope} />;
    case "Order": return <Order id={orderId} {...scope} />;
    case "Notifications": return <Notifications {...scope} />;
    case "Support": return <Support {...scope} />;
    case "NewCase": return <NewCase search={query} {...scope} />;
    case "Admin": return <Admin section={params?.section} initialEvent={params?.event_id} {...scope} />;
    case "Thread": return <Thread id={params?.caseId ?? ""} {...scope} />;
    case "OrganizerEvents": return <OrganizerEvents {...scope} />;
    case "OrganizerProfile": return <OrganizerProfile {...scope} />;
    case "NewEvent": return <EventEditor {...scope} />;
    case "EditEvent": return <EventEditor id={eventId} {...scope} />;
    case "PreviewEvent": return <EventDetail id={eventId} locale={locale} search={query} open={open} preview />;
    case "SeatingSetup": return <Seating id={eventId} locale={locale} />;
    case "Staff": return <Staff id={eventId} locale={locale} />;
    case "Campaigns": return <Campaigns id={eventId} {...scope} />;
    case "Operations": return <Operations id={eventId} initialView={params?.view} {...scope} />;
    case "OperationDetail": return <Operations id={eventId} orderId={orderId} {...scope} />;
    case "Activation": return <Activation id={eventId} {...scope} />;
    case "Financials": return <Financials id={eventId} locale={locale} />;
    case "Accounts": return <Accounts locale={locale} />;
    case "Payouts": return <Payouts {...scope} />;
    case "Analytics": return <Insights id={eventId} locale={locale} />;
    case "History": return <Insights id={eventId} locale={locale} history />;
  }
}
