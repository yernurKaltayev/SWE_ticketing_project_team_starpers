import { ApiError } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";

/** Only the fields the calendar options read; both F2 and F3 event shapes fit. */
export type CalendarEvent = Pick<
  components["schemas"]["EventOut"],
  | "id"
  | "title"
  | "description"
  | "starts_at"
  | "ends_at"
  | "timezone"
  | "status"
  | "visibility"
> & { share_token?: string | null };
export type CalendarVenue = { name: string; address: string; city: string };

/**
 * "add": a live event can be added. "cancelled": only the updated `.ics` is
 * offered, so a calendar that already holds the event receives STATUS:CANCELLED.
 * Drafts and unknown states offer nothing.
 */
export function calendarMode(event: CalendarEvent): "add" | "cancelled" | null {
  if (event.status === "published") return "add";
  if (event.status === "cancelled") return "cancelled";
  return null;
}

/**
 * P14 file path. An unlisted event's share token is sent only when the API
 * revealed it to this viewer; otherwise P14 applies event-level access.
 */
export function calendarFilePath(event: CalendarEvent) {
  const path = `/api/v1/events/${encodeURIComponent(event.id)}/calendar.ics`;
  return event.visibility === "unlisted" && event.share_token
    ? `${path}?share_token=${encodeURIComponent(event.share_token)}`
    : path;
}

export function calendarFileName(event: CalendarEvent) {
  const slug = event.title
    .normalize("NFKD")
    .replace(/[^a-z\d]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 60);
  return `${slug || "event"}.ics`;
}

/** Rejects HTML error pages or empty bodies that a proxy may return with 200. */
export function validateCalendar(blob: Blob) {
  if (!blob.size || blob.type.split(";")[0].trim() !== "text/calendar")
    throw new ApiError(200, "invalid_response", "Unexpected calendar file.");
  return blob;
}

/**
 * Public events link to their page. Private/unlisted links are left out so
 * a share token never reaches a third-party calendar provider.
 */
export function eventPageUrl(event: CalendarEvent, origin: string) {
  return event.visibility === "public"
    ? `${origin.replace(/\/$/, "")}/events/${encodeURIComponent(event.id)}`
    : null;
}

const utcStamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const utcIso = (iso: string) => new Date(iso).toISOString().replace(/\.\d{3}/, "");

export function location(venue?: CalendarVenue | null) {
  return venue
    ? [venue.name, venue.address, venue.city].filter(Boolean).join(", ")
    : "";
}

/** Provider URLs have practical length limits; the .ics keeps the full text. */
function details(event: CalendarEvent, url: string | null) {
  const text = (event.description ?? "").trim();
  const short = text.length > 600 ? `${text.slice(0, 597)}…` : text;
  return [short, url].filter(Boolean).join("\n\n");
}

/**
 * Google Calendar template link. Instants are UTC (`Z`) and `ctz` keeps the
 * event's own zone, so the entry shows the venue's local time.
 */
export function googleCalendarUrl(
  event: CalendarEvent,
  venue: CalendarVenue | null | undefined,
  origin: string,
) {
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: event.title,
    dates: `${utcStamp(event.starts_at)}/${utcStamp(event.ends_at)}`,
    ctz: event.timezone,
    details: details(event, eventPageUrl(event, origin)),
    location: location(venue),
  });
  return `https://calendar.google.com/calendar/render?${params}`;
}

/** Outlook.com compose link; it reads UTC instants and shows the user's zone. */
export function outlookCalendarUrl(
  event: CalendarEvent,
  venue: CalendarVenue | null | undefined,
  origin: string,
) {
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: event.title,
    startdt: utcIso(event.starts_at),
    enddt: utcIso(event.ends_at),
    body: details(event, eventPageUrl(event, origin)),
    location: location(venue),
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params}`;
}
