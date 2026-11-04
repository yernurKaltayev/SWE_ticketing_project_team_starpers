import { http, HttpResponse } from "msw";
import type { components } from "@biletflow/shared/api";

export const scenarios = [
  "success",
  "empty",
  "validation",
  "forbidden",
  "unauthorized",
  "network",
] as const;
export type Scenario = (typeof scenarios)[number];
let scenario: Scenario = "success";
export function setScenario(value: Scenario) {
  scenario = value;
}
const headers = { "X-Request-ID": "f0-mock-request" };
export const user: components["schemas"]["UserOut"] = {
  id: "4d578712-1098-4f9e-8b35-3b6564f36720",
  full_name: "Demo organizer",
  email: "organizer@example.com",
  phone: null,
  role: "organizer",
  email_verified_at: "2026-01-01T00:00:00Z",
};
const event: components["schemas"]["EventOut"] = {
  id: "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419",
  title: "Demo event",
  description: "F0 contract fixture",
  category: "student",
  venue_id: "4aab9cc5-d54c-47e8-9b53-09085463ce4c",
  layout_id: null,
  starts_at: "2027-01-20T18:00:00+05:00",
  ends_at: "2027-01-20T20:00:00+05:00",
  timezone: "Asia/Almaty",
  visibility: "public",
  seating_mode: "general_admission",
  capacity: 100,
  registration_opens_at: null,
  registration_closes_at: null,
  status: "published",
  paid_sales_status: "disabled",
  share_token: "f0-demo-share",
  images: [],
};
function failure() {
  if (scenario === "network") return HttpResponse.error();
  if (scenario === "forbidden")
    return HttpResponse.json(
      { code: "forbidden", message: "You do not have access.", details: null },
      { status: 403, headers },
    );
  if (scenario === "unauthorized")
    return HttpResponse.json(
      {
        code: "unauthorized",
        message: "Authentication is required.",
        details: null,
      },
      { status: 401, headers },
    );
  if (scenario === "validation")
    return HttpResponse.json(
      {
        code: "validation_error",
        message: "The request is invalid.",
        details: [
          {
            field: "body.full_name",
            message: "A full name is required.",
            type: "missing",
          },
        ],
      },
      { status: 422, headers },
    );
  return null;
}
export const handlers = [
  http.get(
    "*/health",
    () =>
      failure() ??
      HttpResponse.json(
        {
          status: "ok",
          database: "ok",
          version: "0.1.0",
        } satisfies components["schemas"]["HealthOut"],
        { headers },
      ),
  ),
  http.get(
    "*/api/v1/events",
    () =>
      failure() ??
      HttpResponse.json(
        {
          items: scenario === "empty" ? [] : [event],
          total: scenario === "empty" ? 0 : 1,
          limit: 20,
          offset: 0,
        } satisfies components["schemas"]["PageEventOut"],
        { headers },
      ),
  ),
  http.get(
    "*/api/v1/me",
    () => failure() ?? HttpResponse.json(user, { headers }),
  ),
  http.patch("*/api/v1/me", async ({ request }) => {
    const failed = failure();
    if (failed) return failed;
    const body = (await request.json()) as components["schemas"]["UserUpdate"];
    return HttpResponse.json({ ...user, ...body }, { headers });
  }),
];
