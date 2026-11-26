import { useRef, useState } from "react";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { FrameIcon } from "../icons";
import { eventCopy } from "./copy";
import { parseEvent } from "./contracts";
import { useEventRequest } from "./data";
import type { Event } from "./model";
import { EventError } from "./ui";
import { coverProblem, coverRules } from "@biletflow/shared/features/events/cover";

/** One cover image per event: pick or drop a file, replace or remove it. */
export function CoverEditor({
  event,
  locale,
  locked,
  onChange,
}: {
  event: Event;
  locale: Locale;
  locked: boolean;
  onChange: (event: Event) => void;
}) {
  const t = eventCopy[locale];
  const request = useEventRequest();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<unknown>();
  const [problem, setProblem] = useState("");
  const [over, setOver] = useState(false);
  const cover = event.images[0];
  const busy = locked || pending;

  function send(path: string, init: { method: string; body?: FormData }) {
    setPending(true);
    setError(undefined);
    void request<unknown>(path, init)
      .then((value) => onChange(parseEvent(value)))
      .catch(setError)
      .finally(() => setPending(false));
  }
  function upload(file: File | undefined) {
    setProblem("");
    if (!file || busy) return;
    const problem = coverProblem(file);
    if (problem === "type") return setProblem(t.coverType);
    if (problem === "size") return setProblem(t.coverSize);
    const body = new FormData();
    body.append("file", file);
    send(`/api/v1/events/${event.id}/images`, { method: "POST", body });
  }

  return (
    <section className="cover-editor">
      <h2>{t.cover}</h2>
      <p className="field-hint">{t.coverHint}</p>
      <EventError error={error} t={t} />
      {problem && (
        <p className="field-error" role="alert">
          {problem}
        </p>
      )}
      <input
        ref={input}
        id="cover-file"
        type="file"
        accept={coverRules.types.join(",")}
        className="visually-hidden"
        tabIndex={-1}
        onChange={(e) => {
          upload(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
      <div
        className={`cover-drop${cover ? " has-cover" : ""}${over ? " is-over" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          if (!busy) setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          upload(e.dataTransfer.files[0]);
        }}
      >
        {cover ? (
          <img src={cover} alt={t.cover} />
        ) : (
          <button
            type="button"
            className="cover-empty"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            <FrameIcon size={28} />
            <strong>{t.coverPick}</strong>
            <span>{t.coverDrop}</span>
          </button>
        )}
        {pending && (
          <div className="cover-pending">
            <Status>{t.working}</Status>
          </div>
        )}
      </div>
      {cover && (
        <div className="controls">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => input.current?.click()}
          >
            {t.coverReplace}
          </button>
          <button
            type="button"
            className="secondary danger-text"
            disabled={busy}
            onClick={() =>
              send(`/api/v1/events/${event.id}/images`, { method: "DELETE" })
            }
          >
            {t.coverRemove}
          </button>
        </div>
      )}
    </section>
  );
}
