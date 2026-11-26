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

// Volunteer check-in accounts: generated per event, limited to scanning, removed after the event.
export type Volunteer = components["schemas"]["VolunteerOut"];
export type VolunteerCredentials = components["schemas"]["VolunteerCredentialsOut"];

export const volunteersPath = (eventId: string) =>
  `/api/v1/events/${encodeURIComponent(eventId)}/volunteers`;
export const volunteerPath = (eventId: string, userId: string) =>
  `${volunteersPath(eventId)}/${encodeURIComponent(userId)}`;
export const volunteerResetPath = (eventId: string, userId: string) =>
  `${volunteerPath(eventId, userId)}/reset-password`;

const strings = (row: Record<string, unknown>, keys: string[]) =>
  keys.every((key) => typeof row[key] === "string");

export function parseVolunteers(value: unknown): Volunteer[] {
  if (!Array.isArray(value)) return invalid();
  return value.map((row) => {
    if (
      !record(row) ||
      !strings(row, ["user_id", "full_name", "login", "created_at", "expires_at"]) ||
      !(row.last_login_at === null || typeof row.last_login_at === "string")
    )
      return invalid();
    return row as Volunteer;
  });
}

export function parseVolunteerCredentials(value: unknown): VolunteerCredentials {
  if (
    !record(value) ||
    !strings(value, ["user_id", "full_name", "login", "password", "expires_at"])
  )
    return invalid();
  return value as VolunteerCredentials;
}
