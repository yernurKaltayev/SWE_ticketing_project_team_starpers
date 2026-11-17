import { http, HttpResponse } from "msw";
import type { components } from "@biletflow/shared/api";
import { mockUserByEmail } from "./auth";
import { mockManagedEvent } from "./events";

type Member = components["schemas"]["StaffMemberOut"];
type AssignIn = components["schemas"]["StaffAssignIn"];
const headers = { "X-Request-ID": "f7-mock" };
const staff = new Map<string, Member[]>();

export function resetStaffMocks() {
  staff.clear();
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
];
