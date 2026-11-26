export const featurePaths = {
  Event: ["/events/:eventId"],
  Seats: ["/events/:eventId/seats"],
  Checkout: ["/events/:eventId/checkout"],
  Orders: ["/account/orders"],
  Order: ["/account/orders/:orderId", "/orders/:orderId", "/orders/:orderId/status"],
  Notifications: ["/account/notifications"],
  Support: ["/support"],
  NewCase: ["/support/new"],
  Thread: ["/support/cases/:caseId"],
  OrganizerEvents: ["/organizer/events", "/organizer"],
  OrganizerProfile: ["/organizer/profile"],
  NewEvent: ["/organizer/events/new"],
  EditEvent: ["/organizer/events/:eventId/edit"],
  PreviewEvent: ["/organizer/events/:eventId/preview"],
  SeatingSetup: ["/organizer/events/:eventId/seating"],
  Staff: ["/organizer/events/:eventId/staff"],
  Campaigns: ["/organizer/events/:eventId/promotions"],
  Operations: ["/organizer/events/:eventId/orders"],
  OperationDetail: ["/organizer/events/:eventId/orders/:orderId"],
  Activation: ["/organizer/events/:eventId/activation"],
  Financials: ["/organizer/events/:eventId/financials"],
  Accounts: ["/organizer/payout-accounts"],
  Payouts: ["/organizer/payouts"],
  Analytics: ["/organizer/events/:eventId/analytics"],
  History: ["/organizer/events/:eventId/history"],
  Admin: ["/admin", "/admin/:section"],
  DevSeating: ["/dev/seating"],
  DevFoundation: ["/dev/foundation"],
  OrganizerUnavailable: ["/organizer/*"],
  AdminUnavailable: ["/admin/*"],
  NotFound: ["*"],
} as const;

export type FeatureName = keyof typeof featurePaths;
export type FeatureParams = Partial<Record<
  "eventId" | "orderId" | "caseId" | "section" | "promo" | "promo_status" | "share" |
  "event_id" | "order_id" | "ticket_id" | "view", string
>>;
export const featureNames = Object.keys(featurePaths) as FeatureName[];
const queryKeys = ["promo", "promo_status", "share", "event_id", "order_id", "ticket_id", "view"] as const;

export function featureParams(params: Record<string, string>, query: URLSearchParams): FeatureParams {
  return { ...Object.fromEntries(queryKeys.flatMap((key) => {
    const value = query.get(key);
    return value ? [[key, value]] : [];
  })), ...params };
}


export const organizerFeatures = new Set<FeatureName>([
  "OrganizerEvents", "OrganizerProfile", "NewEvent", "EditEvent", "PreviewEvent",
  "SeatingSetup", "Staff", "Campaigns", "Operations", "OperationDetail", "Activation",
  "Financials", "Accounts", "Payouts", "Analytics", "History", "OrganizerUnavailable",
]);
