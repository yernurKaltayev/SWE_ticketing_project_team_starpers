import { http, HttpResponse } from "msw";
import type { components } from "@biletflow/shared/api";
import { mockUserByEmail } from "./auth";
import { mockManagedEvent } from "./events";

type Member = components["schemas"]["StaffMemberOut"];
type AssignIn = components["schemas"]["StaffAssignIn"];
const headers = { "X-Request-ID": "f7-mock" };
type Volunteer = components["schemas"]["VolunteerOut"];
type Credentials = components["schemas"]["VolunteerCredentialsOut"];
const staff = new Map<string, Member[]>();
const volunteers = new Map<string, Volunteer[]>();
let sequence = 0;

export function resetStaffMocks() {
  staff.clear();
  volunteers.clear();
  sequence = 0;
}

function credentialsFor(volunteer: Volunteer): Credentials {
  sequence += 1;
  return {
    user_id: volunteer.user_id,
    full_name: volunteer.full_name,
    login: volunteer.login,
    password: `mock-pass-${sequence}`,
    expires_at: volunteer.expires_at,
  };
}

const fail = (status: number, code: string) =>
  HttpResponse.json(
    { code, message: "Development fixture response.", details: null },
    { status, headers },
  );

export const staffHandlers = [
  http.get("*/api/v1/events/:eventId/staff", ({ request, params }) => {
    const event = mockManagedEvent(request, String(params.eventId));
    if (event instanceof Response) return event;
    return HttpResponse.json(staff.get(event.id) ?? [], { headers });
  }),
  http.post("*/api/v1/events/:eventId/staff", async ({ request, params }) => {
    const event = mockManagedEvent(request, String(params.eventId));
    if (event instanceof Response) return event;
    const body = (await request.json()) as AssignIn;
    if (!body.email || !["checkin", "support", "manager"].includes(body.role))
      return fail(422, "validation_error");
    const person = mockUserByEmail(body.email);
    if (!person) return fail(404, "user_not_found");
    const members = staff.get(event.id) ?? [];
    if (members.some((m) => m.user_id === person.id))
      return fail(409, "staff_already_assigned");
    members.push({
      user_id: person.id,
      email: person.email,
      full_name: person.full_name,
      role: body.role,
      assigned_at: new Date().toISOString(),
    });
    staff.set(event.id, members);
    return HttpResponse.json(
      {
        id: crypto.randomUUID(),
        event_id: event.id,
        user_id: person.id,
        role: body.role,
      } satisfies components["schemas"]["StaffAssignmentOut"],
      { status: 201, headers },
    );
  }),
  http.delete(
    "*/api/v1/events/:eventId/staff/:userId",
    ({ request, params }) => {
      const event = mockManagedEvent(request, String(params.eventId));
      if (event instanceof Response) return event;
      const members = staff.get(event.id) ?? [];
      const next = members.filter((m) => m.user_id !== params.userId);
      if (next.length === members.length) return fail(404, "staff_not_found");
      staff.set(event.id, next);
      return new HttpResponse(null, { status: 204, headers });
    },
  ),
  http.get("*/api/v1/events/:eventId/volunteers", ({ request, params }) => {
    const event = mockManagedEvent(request, String(params.eventId));
    if (event instanceof Response) return event;
    return HttpResponse.json(volunteers.get(event.id) ?? [], { headers });
  }),
  http.post("*/api/v1/events/:eventId/volunteers", async ({ request, params }) => {
    const event = mockManagedEvent(request, String(params.eventId));
    if (event instanceof Response) return event;
    const body = (await request.json()) as { full_name?: string };
    if (!body.full_name?.trim()) return fail(422, "validation_error");
    const list = volunteers.get(event.id) ?? [];
    const volunteer: Volunteer = {
      user_id: crypto.randomUUID(),
      full_name: body.full_name.trim(),
      login: `v-mock${list.length + 1}@volunteers.biletflow.kz`,
      created_at: new Date().toISOString(),
      last_login_at: null,
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
    volunteers.set(event.id, [...list, volunteer]);
    return HttpResponse.json(credentialsFor(volunteer), { status: 201, headers });
  }),
  http.post(
    "*/api/v1/events/:eventId/volunteers/:userId/reset-password",
    ({ request, params }) => {
      const event = mockManagedEvent(request, String(params.eventId));
      if (event instanceof Response) return event;
      const volunteer = (volunteers.get(event.id) ?? []).find(
        (v) => v.user_id === params.userId,
      );
      if (!volunteer) return fail(404, "volunteer_not_found");
      return HttpResponse.json(credentialsFor(volunteer), { headers });
    },
  ),
  http.delete(
    "*/api/v1/events/:eventId/volunteers/:userId",
    ({ request, params }) => {
      const event = mockManagedEvent(request, String(params.eventId));
      if (event instanceof Response) return event;
      const list = volunteers.get(event.id) ?? [];
      const next = list.filter((v) => v.user_id !== params.userId);
      if (next.length === list.length) return fail(404, "volunteer_not_found");
      volunteers.set(event.id, next);
      return new HttpResponse(null, { status: 204, headers });
    },
  ),
];

/** Shared read boundary for P10 fixture permissions; does not grant live access. */
export function mockStaffMembers(eventId: string) {
  return staff.get(eventId) ?? [];
}
