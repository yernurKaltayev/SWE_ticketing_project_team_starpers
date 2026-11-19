import { expect, it } from "vitest";
import {
  calendarFileName,
  calendarFilePath,
  calendarMode,
  eventPageUrl,
  googleCalendarUrl,
  outlookCalendarUrl,
  validateCalendar,
} from "./model";
import type { CalendarEvent } from "./model";

const event: CalendarEvent = {
  id: "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419",
  title: "Demo · Student technology meetup",
  description: "Line one\nLine two",
  starts_at: "2027-01-20T18:00:00+05:00",
  ends_at: "2027-01-20T20:00:00+05:00",
  timezone: "Asia/Almaty",
  status: "published",
  visibility: "public",
  share_token: "",
};
const venue = { name: "Hall", address: "1 Main St", city: "Astana" };
const origin = "https://demo.biletflow.kz";

it("offers calendar options only for published or cancelled events", () => {
  expect(calendarMode(event)).toBe("add");
  expect(calendarMode({ ...event, status: "cancelled" })).toBe("cancelled");
  expect(calendarMode({ ...event, status: "draft" })).toBeNull();
  expect(calendarMode({ ...event, status: "archived" as never })).toBeNull();
});

it("builds the P14 path and passes a share token only for a revealed unlisted event", () => {
  expect(calendarFilePath(event)).toBe(`/api/v1/events/${event.id}/calendar.ics`);
  expect(
    calendarFilePath({ ...event, visibility: "unlisted", share_token: "a b&c" }),
  ).toBe(`/api/v1/events/${event.id}/calendar.ics?share_token=a%20b%26c`);
  expect(
    calendarFilePath({ ...event, visibility: "unlisted", share_token: "" }),
  ).toBe(`/api/v1/events/${event.id}/calendar.ics`);
  // A public event never forwards a token, even if one is present.
  expect(calendarFilePath({ ...event, share_token: "secret" })).not.toContain(
    "secret",
  );
});

it("keeps file names ASCII-safe and non-empty", () => {
  expect(calendarFileName(event)).toBe("demo-student-technology-meetup.ics");
  expect(calendarFileName({ ...event, title: "Концерт" })).toBe("event.ics");
});

it("accepts only a non-empty text/calendar body", () => {
  const ok = new Blob(["BEGIN:VCALENDAR"], { type: "text/calendar; charset=utf-8" });
  expect(validateCalendar(ok)).toBe(ok);
  expect(() =>
    validateCalendar(new Blob(["<html>"], { type: "text/html" })),
  ).toThrow();
  expect(() => validateCalendar(new Blob([], { type: "text/calendar" }))).toThrow();
});

it("links only public event pages so share tokens never reach providers", () => {
  expect(eventPageUrl(event, `${origin}/`)).toBe(`${origin}/events/${event.id}`);
  expect(eventPageUrl({ ...event, visibility: "unlisted" }, origin)).toBeNull();
  expect(eventPageUrl({ ...event, visibility: "private" }, origin)).toBeNull();
});

it("builds a Google template in UTC with the event's own zone, venue and page", () => {
  const url = new URL(googleCalendarUrl(event, venue, origin));
  expect(url.origin + url.pathname).toBe(
    "https://calendar.google.com/calendar/render",
  );
  expect(url.searchParams.get("action")).toBe("TEMPLATE");
  expect(url.searchParams.get("text")).toBe(event.title);
  expect(url.searchParams.get("dates")).toBe("20270120T130000Z/20270120T150000Z");
  expect(url.searchParams.get("ctz")).toBe("Asia/Almaty");
  expect(url.searchParams.get("location")).toBe("Hall, 1 Main St, Astana");
  expect(url.searchParams.get("details")).toBe(
    `Line one\nLine two\n\n${origin}/events/${event.id}`,
  );
});

it("builds an Outlook compose link and truncates long descriptions", () => {
  const long = { ...event, visibility: "private" as const, description: "x".repeat(2000) };
  const url = new URL(outlookCalendarUrl(long, null, origin));
  expect(url.hostname).toBe("outlook.live.com");
  expect(url.searchParams.get("startdt")).toBe("2027-01-20T13:00:00Z");
  expect(url.searchParams.get("enddt")).toBe("2027-01-20T15:00:00Z");
  expect(url.searchParams.get("location")).toBe("");
  const body = url.searchParams.get("body")!;
  expect(body.length).toBe(598);
  expect(body).not.toContain(origin);
});
