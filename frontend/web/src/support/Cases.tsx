import { Link, useSearchParams } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { useLiveQuery } from "./data";
import { offsetValue, parseCases, statuses, uuid } from "./model";
import { supportCopy } from "./copy";
import { Pager, SupportError, Timestamp } from "./ui";
import "./support.css";
export default function Cases({ locale }: { locale: Locale }) {
  const t = supportCopy[locale];
  const [params, setParams] = useSearchParams();
  const offset = offsetValue(params.get("offset"));
  const status = statuses.includes(
    params.get("status") as (typeof statuses)[number],
  )
    ? params.get("status")!
    : "";
  const role = ["requester", "handler"].includes(params.get("role") ?? "")
    ? params.get("role")!
    : "";
  const eventId = params.get("event_id");
  const p = new URLSearchParams({ limit: "20", offset: String(offset) });
  if (status) p.set("status", status);
  if (role) p.set("role", role);
  if (uuid(eventId)) p.set("event_id", eventId);
  const records = useLiveQuery(`/api/v1/support/cases?${p}`, parseCases);
  return (
    <section className="support-page">
      <header>
        <h1>{t.inbox}</h1>
        <Link className="action-link" to="/support/new">
          {t.newCase}
        </Link>
        <p>{t.polling}</p>
      </header>
      <form
        className="support-filters"
        onSubmit={(e) => {
          e.preventDefault();
          const values = new FormData(e.currentTarget);
          const next = new URLSearchParams();
          for (const key of ["status", "role"]) {
            const v = String(values.get(key) ?? "");
            if (v) next.set(key, v);
          }
          if (uuid(eventId)) next.set("event_id", eventId);
          setParams(next);
        }}
      >
        <div>
          <label htmlFor="case-role">{t.inbox}</label>
          <select id="case-role" name="role" defaultValue={role} key={role}>
            <option value="">{t.all}</option>
            <option value="requester">{t.mine}</option>
            <option value="handler">{t.handler}</option>
          </select>
        </div>
        <div>
          <label htmlFor="case-status">{t.status}</label>
          <select
            id="case-status"
            name="status"
            defaultValue={status}
            key={status}
          >
            <option value="">{t.allStatuses}</option>
            {statuses.map((s) => (
              <option value={s} key={s}>
                {t.statuses[s]}
              </option>
            ))}
          </select>
        </div>
        <button>{t.filter}</button>
        <button
          type="button"
          className="secondary"
          disabled={records.isFetching}
          onClick={() => void records.refetch()}
        >
          {t.refresh}
        </button>
      </form>
      <SupportError error={records.error} t={t} />
      {records.isPending && <p role="status">{t.loading}</p>}
      {records.data && !records.isError && (
        <>
          {!records.data.items.length && <p>{t.empty}</p>}
          <ul className="support-list">
            {records.data.items.map((c) => (
              <li className="support-card" key={c.id}>
                <h2>
                  <Link to={`/support/cases/${encodeURIComponent(c.id)}`}>
                    {c.subject}
                  </Link>
                </h2>
                <p>
                  {t.categories[c.category]} ·{" "}
                  <span className="status-badge">{t.statuses[c.status]}</span>
                </p>
                <p>
                  {c.audience === "organizer_case"
                    ? t.platformAudience
                    : t.customerAudience}
                </p>
                <Timestamp value={c.created_at} locale={locale} />
              </li>
            ))}
          </ul>
          <Pager
            offset={offset}
            total={records.data.total}
            t={t}
            change={(n) => {
              const p = new URLSearchParams(params);
              p.set("offset", String(n));
              setParams(p);
            }}
          />
        </>
      )}
    </section>
  );
}
