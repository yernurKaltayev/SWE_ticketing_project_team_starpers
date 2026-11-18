import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { useLiveQuery } from "./data";
import { noticeLink, offsetValue, parseNotice, parseNotices } from "./model";
import { supportCopy } from "./copy";
import { Pager, SupportError, Timestamp } from "./ui";
import "./support.css";
const unreadPath = "/api/v1/me/notifications?unread_only=true&limit=1&offset=0";
export default function Notifications({ locale }: { locale: Locale }) {
  const t = supportCopy[locale],
    { user, controller } = useSession();
  const [params, setParams] = useSearchParams();
  const offset = offsetValue(params.get("offset"));
  const unread = params.get("unread") === "true";
  const path = `/api/v1/me/notifications?limit=20&offset=${offset}&unread_only=${unread}`;
  const records = useLiveQuery(path, parseNotices);
  const count = useLiveQuery(unreadPath, parseNotices, 15000);
  const [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState<unknown>();
  const lock = useRef(false);
  async function mark(id: string) {
    if (lock.current) return;
    lock.current = true;
    const owner = user?.id;
    setBusy(id);
    setError(undefined);
    try {
      const marked = parseNotice(
        await controller.request(
          `/api/v1/me/notifications/${encodeURIComponent(id)}/read`,
          { method: "POST" },
        ),
      );
      if (marked.id !== id || !marked.read_at)
        throw new Error("invalid_read_response");
      if (controller.getSnapshot().user?.id === owner) {
        await Promise.all([records.refetch(), count.refetch()]);
      }
    } catch (e) {
      if (controller.getSnapshot().user?.id === owner) setError(e);
    } finally {
      lock.current = false;
      setBusy(null);
    }
  }
  return (
    <section className="support-page">
      <h1>{t.notifications}</h1>
      <p>{t.noticeHint}</p>
      <p>{t.polling}</p>
      {!count.isError && count.data && (
        <p role="status">
          {t.unreadCount}: {count.data.total}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          setParams(form.has("unread") ? { unread: "true" } : {});
        }}
      >
        <label className="support-check">
          <input
            type="checkbox"
            name="unread"
            defaultChecked={unread}
            key={String(unread)}
          />
          {t.unreadOnly}
        </label>
        <div className="controls">
          <button>{t.filter}</button>
          <button
            type="button"
            className="secondary"
            disabled={records.isFetching}
            onClick={() => {
              void records.refetch();
              void count.refetch();
            }}
          >
            {t.refresh}
          </button>
        </div>
      </form>
      <SupportError error={records.error ?? error} t={t} />
      {records.isPending && <p role="status">{t.loading}</p>}
      {records.data && !records.isError && (
        <>
          {!records.data.items.length && <p>{t.empty}</p>}
          <ul className="support-list">
            {records.data.items.map((n) => {
              const target = noticeLink(n, user?.role ?? "");
              return (
                <li
                  className={`support-card ${n.read_at ? "" : "support-unread"}`}
                  key={n.id}
                >
                  <h2>{n.title}</h2>
                  <Timestamp value={n.created_at} locale={locale} />
                  <p className="support-body">{n.body}</p>
                  <span className="status-badge">
                    {n.read_at ? t.read : t.unread}
                  </span>
                  <div className="controls">
                    {target && <Link to={target}>{t.open}</Link>}
                    {!n.read_at && (
                      <button
                        className="secondary"
                        disabled={!!busy}
                        onClick={() => void mark(n.id)}
                      >
                        {busy === n.id ? t.working : t.markRead}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
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
