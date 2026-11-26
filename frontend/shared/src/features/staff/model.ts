import { ApiError } from "../../index";
import type { components } from "../../generated/api";

export type StaffMember = components["schemas"]["StaffMemberOut"];
export type StaffRole = components["schemas"]["StaffAssignIn"]["role"];
export const staffRoles: readonly StaffRole[] = ["checkin", "support", "manager"];

export const staffPath = (eventId: string) =>
  `/api/v1/events/${encodeURIComponent(eventId)}/staff`;
export const staffMemberPath = (eventId: string, userId: string) =>
  `${staffPath(eventId)}/${encodeURIComponent(userId)}`;

const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);

function invalid(): never {
  throw new ApiError(200, "invalid_response", "Unexpected API response.");
}

export function parseStaff(value: unknown): StaffMember[] {
  if (!Array.isArray(value)) return invalid();
  return value.map((row) => {
    if (
      !record(row) ||
      ![row.user_id, row.email, row.full_name, row.role, row.assigned_at].every(
        (v) => typeof v === "string",
      )
    )
      return invalid();
    return row as StaffMember;
  });
}

export const validStaffEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
