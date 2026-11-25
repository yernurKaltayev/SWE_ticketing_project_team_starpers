import { useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { useLiveQuery } from "./data";
import { noticeLink, offsetValue, parseNotice, parseNotices } from "./model";
import { supportCopy } from "./copy";
import { Pager, SupportError, Timestamp } from "./ui";
import "./support.css";
/** The body is the plain-text email; keep only its message lines for a short preview. */
function noticePreview(body: string): string {
  return body
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !/^(hello|hi|dear|здравствуйте|сәлеметсіз)\b/i.test(line) &&
        !/https?:\/\//.test(line) &&
        !/^the biletflow team$/i.test(line) &&
        !/^(—|-)?\s*biletflow$/i.test(line),
    )
    .join(" ");
}
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
  const unreadTotal = !count.isError && count.data ? count.data.total : null;
  return (
    <section className="support-page">
      <header className="title-row spread">
        <h1>{t.notifications}</h1>
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
      </header>
      <div className="chip-row" role="group" aria-label={t.unreadCount}>
        <button
          type="button"
          className="chip"
          aria-pressed={!unread}
          onClick={() => setParams({})}
        >
          {t.allNotices}
        </button>
        <button
          type="button"
          className="chip"
          aria-pressed={unread}
          onClick={() => setParams({ unread: "true" })}
        >
          {t.unreadOnly}
          {unreadTotal ? ` · ${unreadTotal}` : ""}
        </button>
      </div>
      <SupportError error={records.error ?? error} t={t} />
      {records.isPending && <p role="status">{t.loading}</p>}
      {records.data && !records.isError && (
        <>
          {!records.data.items.length && <p className="empty-state">{t.empty}</p>}
          <ul className="notice-list">
            {records.data.items.map((n) => {
              const target = noticeLink(n, user?.role ?? "");
              const preview = noticePreview(n.body);
              return (
                <li
                  className={`notice-row${n.read_at ? "" : " is-unread"}`}
                  key={n.id}
                >
                  <div className="notice-main">
                    <h2>{n.title}</h2>
                    {preview && <p className="notice-preview">{preview}</p>}
                    <Timestamp value={n.created_at} locale={locale} />
                  </div>
                  <div className="notice-actions">
                    {target && (
                      <Link className="action-link ghost" to={target}>
                        {t.open}
                      </Link>
                    )}
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
