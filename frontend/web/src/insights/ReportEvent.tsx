import { useState } from "react";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { label } from "./copy";
import { parseRow } from "./model";
import { useWriteScope } from "./data";
import { Failure } from "./ui";
export function ReportEvent({
  id,
  locale
}: {
  id: string;
  locale: Locale;
}) {
  const {
      user
    } = useSession(),
    t = (s: string) => label(locale, s);
  const [open, setOpen] = useState(false),
    [reason, setReason] = useState("");
  const write = useWriteScope(`report:${id}`);
  return <aside className="insights">
  <button className="secondary" onClick={() => setOpen(v => !v)}>
    {t("report")}
  </button>
  {open && <form className="insights-card" noValidate onSubmit={e => {
      e.preventDefault();
      if (!user || !reason.trim() || reason.trim().length > 2000) return;
      void write.run(`/api/v1/events/${encodeURIComponent(id)}/reports`, {
        reason: reason.trim()
      }, "POST", v => {
        const result = parseRow("reports", v);
        if (result.event_id !== id) throw new Error("response_target");
        return result;
      });
    }}>
    <p>
      {t("reportHint")}
    </p>
    {user ? <>
      <label htmlFor="event-report-reason">
        {t("reason")}
      </label>
      <textarea name="reason" id="event-report-reason" maxLength={2000} value={reason} disabled={write.busy || write.saved || write.uncertain} onChange={e => setReason(e.target.value)} />
      <button disabled={!reason.trim() || write.busy || write.saved || write.uncertain}>
        {t(write.busy ? "working" : "report")}
      </button>
    </> : <p>
      {t("denied")}
    </p>}
    <Failure error={write.error} locale={locale} />
    {write.saved && <p role="status">
      {t("saved")}
    </p>}
    {write.uncertain && <p role="alert">
      {t("unknown")}
    </p>}
  </form>}
</aside>;
}
