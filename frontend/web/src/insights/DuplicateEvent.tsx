import { useState } from "react";
import { BackLink } from "../BackLink";
import { useNavigate } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { parseEvent } from "../events/contracts";
import { allEvents } from "./model";
import { useWriteScope } from "./data";
import { label } from "./copy";
import { eventCopy } from "../events/copy";
import { Confirm, Failure } from "./ui";
export function DuplicateEvent({
  id,
  title,
  locale,
  disabled = false
}: {
  id: string;
  title: string;
  locale: Locale;
  disabled?: boolean;
}) {
  const {
      user,
      controller
    } = useSession(),
    navigate = useNavigate(),
    t = (s: string) => label(locale, s);
  const write = useWriteScope(`duplicate:${id}`);
  const [open, setOpen] = useState(false),
    [read, setRead] = useState(false),
    [checking, setChecking] = useState(false);
  if (user?.role !== "organizer") return null;
  return <div>
  <button type="button" className="secondary" disabled={disabled || write.busy || write.uncertain} onClick={() => setOpen(true)}>
    {t("duplicate")}
  </button>
  <Failure error={write.error} locale={locale} />
  {write.uncertain && <>
    <p role="alert">
      {t("unknown")}
    </p>
    <BackLink to="/organizer/events">{eventCopy[locale].back}</BackLink>
    <button type="button" disabled={checking} onClick={() => {
        setChecking(true);
        void allEvents(controller.request).then(() => setRead(true)).catch(() => setRead(false)).finally(() => setChecking(false));
      }}>
      {t("refresh")}
    </button>
    <button type="button" disabled={!read || checking} onClick={() => {
        write.acknowledge();
        setOpen(false);
        setRead(false);
      }}>
      {t("checkedDrafts")}
    </button>
  </>}
  {open && <Confirm title={`${t("duplicate")} · ${title}`} locale={locale} busy={write.busy} blocked={write.uncertain} error={write.error} onClose={() => setOpen(false)} onConfirm={() => {
      void write.run(`/api/v1/events/${encodeURIComponent(id)}/duplicate`, undefined, "POST", value => {
        const clone = parseEvent(value);
        if (clone.id === id || clone.status !== "draft" || clone.paid_sales_status !== "disabled") throw new Error("invalid_clone");
        return clone;
      }).then(result => {
        if (result) {
          if (result.status !== "draft" || result.id === id) return;
          setOpen(false);
          navigate(`/organizer/events/${encodeURIComponent(result.id)}/edit`);
        }
      });
    }}>
    <p>
      {t("duplicateHint")}
    </p>
  </Confirm>}
</div>;
}
