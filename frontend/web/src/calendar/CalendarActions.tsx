import { useEffect, useRef, useState } from "react";
import { ApiError, zoneLabel } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useEventRequest } from "../events/data";
import { CalendarIcon } from "../icons";
import { calendarCopy } from "./copy";
import {
  calendarFileName,
  calendarFilePath,
  calendarMode,
  googleCalendarUrl,
  outlookCalendarUrl,
  validateCalendar,
} from "./model";
import type { CalendarEvent, CalendarVenue } from "./model";
import "./calendar.css";

/**
 * F11 calendar options: the canonical P14 `.ics` download plus one-click
 * Google/Outlook templates. Nothing here requests calendar write access.
 */
export function CalendarActions({
  event,
  venue,
  locale,
}: {
  event: CalendarEvent;
  venue?: CalendarVenue | null;
  locale: Locale;
}) {
  const t = calendarCopy[locale];
  const request = useEventRequest();
  const [error, setError] = useState<unknown>(null);
  const [working, setWorking] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const mode = calendarMode(event);
  if (!mode) return null;
  const origin = window.location.origin;
  const headingId = `calendar-${event.id}`;

  async function download() {
    if (working) return;
    setWorking(true);
    setError(null);
    try {
      const blob = validateCalendar(
        await request<Blob>(calendarFilePath(event), {
          responseType: "blob",
          headers: { Accept: "text/calendar" },
        }),
      );
      if (!active.current) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = calendarFileName(event);
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (caught) {
      if (active.current) setError(caught);
    } finally {
      if (active.current) setWorking(false);
    }
  }

  const message =
    error instanceof ApiError
      ? error.status === 0
        ? t.network
        : [401, 403, 404].includes(error.status)
          ? t.unavailable
          : t.error
      : error
        ? t.error
        : null;

  return (
    <section className="calendar-actions" aria-labelledby={headingId}>
      <h2 id={headingId}>
        <CalendarIcon />
        {t.title}
      </h2>
      {mode === "cancelled" && <p className="notice">{t.cancelled}</p>}
      <div className="calendar-buttons">
        <button
          type="button"
          className="secondary"
          disabled={working}
          onClick={() => {
            void download();
          }}
        >
          {working
            ? t.working
            : mode === "cancelled"
              ? t.downloadUpdated
              : t.download}
        </button>
        {mode === "add" && (
          <>
            <a
              className="action-link ghost"
              href={googleCalendarUrl(event, venue, origin)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Google Calendar
              <span className="visually-hidden"> ({t.newTab})</span>
            </a>
            <a
              className="action-link ghost"
              href={outlookCalendarUrl(event, venue, origin)}
              target="_blank"
              rel="noopener noreferrer"
            >
              Outlook.com
              <span className="visually-hidden"> ({t.newTab})</span>
            </a>
          </>
        )}
      </div>
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      <p className="field-hint">
        {t.zone(zoneLabel(event.timezone, locale))} {t.hint}
      </p>
    </section>
  );
}
