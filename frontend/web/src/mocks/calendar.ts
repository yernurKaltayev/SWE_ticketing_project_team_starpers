import { http, HttpResponse } from "msw";
import { mockAllEvents, mockManagedEvent } from "./events";

/**
 * Development fixture for P14 `GET /events/{id}/calendar.ics`, labelled as a
 * mock in PRODID. Access mirrors P14: public published/cancelled events are
 * anonymous, unlisted ones need their share token, everything else needs
 * event-level access (otherwise 404, never 403).
 */
const stamp = (iso: string) =>
  new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escape = (text: string) =>
  text.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const notFound = () =>
  HttpResponse.json(
    { code: "event_not_found", message: "The event was not found.", details: null },
    { status: 404, headers: { "X-Request-ID": "f11-mock" } },
  );

export const calendarHandlers = [
  http.get("*/api/v1/events/:id/calendar.ics", ({ request, params }) => {
    const event = mockAllEvents()
      .map((record) => record.value)
      .find((e) => e.id === params.id);
    if (!event) return notFound();
    const live = ["published", "cancelled"].includes(event.status);
    const token = new URL(request.url).searchParams.get("share_token");
    const allowed =
      (live && event.visibility === "public") ||
      (live &&
        event.visibility === "unlisted" &&
        !!token &&
        token === event.share_token) ||
      !(mockManagedEvent(request, event.id) instanceof Response);
    if (!allowed) return notFound();
    const status =
      event.status === "cancelled"
        ? "CANCELLED"
        : event.status === "draft"
          ? "TENTATIVE"
          : "CONFIRMED";
    const body = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//BiletFlow//Development mock calendar//EN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      `UID:${event.id}@biletflow.kz`,
      "SEQUENCE:0",
      `DTSTAMP:${stamp(new Date().toISOString())}`,
      `DTSTART:${stamp(event.starts_at)}`,
      `DTEND:${stamp(event.ends_at)}`,
      `SUMMARY:${escape(event.title)}`,
      `DESCRIPTION:${escape(event.description ?? "")}`,
      `STATUS:${status}`,
      "END:VEVENT",
      "END:VCALENDAR",
      "",
    ].join("\r\n");
    return new HttpResponse(body, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="event-${event.id}.ics"`,
        "X-Request-ID": "f11-mock",
      },
    });
  }),
];
