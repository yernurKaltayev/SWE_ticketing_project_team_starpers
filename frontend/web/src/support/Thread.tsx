import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { parseStaff, staffPath } from "../staff/model";
import {
  useLiveQuery,
  useVisible,
  useResume,
  retryRead,
  readDelay,
} from "./data";
import {
  canHandle,
  casePath,
  definiteFailure,
  mergeMessages,
  messageBody,
  parseCase,
  parseMessage,
  readMessages,
  statuses,
  terminalRead,
} from "./model";
import type { Case, CaseStatus, Feed } from "./model";
import { useDraft } from "./drafts";
import { supportCopy } from "./copy";
import { ContextDetails, SupportError, Timestamp } from "./ui";
import "./support.css";
import { BackLink } from "../BackLink";
export default function Thread({ locale }: { locale: Locale }) {
  const { caseId = "" } = useParams();
  const { user } = useSession();
  return <Content key={`${user?.id}:${caseId}`} id={caseId} locale={locale} />;
}
function Content({ id, locale }: { id: string; locale: Locale }) {
  const t = supportCopy[locale],
    { user, controller } = useSession(),
    client = useQueryClient(),
    visible = useVisible();
  const caseParser = useMemo(
    () => (value: unknown) => {
      const parsed = parseCase(value);
      if (parsed.id !== id) throw new Error("wrong_case");
      return parsed;
    },
    [id],
  );
  const record = useLiveQuery(casePath(id), caseParser, 5000);
  const c = record.isError ? undefined : record.data;
  const feedKey = useMemo(
    () => ["f9", user?.id, `${casePath(id)}/messages`],
    [user?.id, id],
  );
  const feed = useQuery({
    queryKey: feedKey,
    queryFn: async ({ signal }) => {
      const result = await readMessages(
        controller.request,
        id,
        client.getQueryData<Feed>(feedKey),
        signal,
      );
      const current = client.getQueryData<Feed>(feedKey);
      return {
        ...result,
        items: mergeMessages(current?.items ?? [], result.items),
      };
    },
    enabled: !!user && !!c && visible,
    retry: retryRead,
    retryDelay: readDelay,
    refetchInterval: (q) =>
      q.state.status === "error" ? false : q.state.data?.more ? 1000 : 5000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });
  const access = useQuery({
    queryKey: ["f9", user?.id, "handler", id, c?.status],
    queryFn: ({ signal }) => canHandle(controller.request, c!, signal),
    enabled: !!user && !!c && visible,
    retry: retryRead,
    retryDelay: readDelay,
    refetchInterval: (q) => (q.state.status === "error" ? false : 10000),
  });
  useResume(feed.refetch, !!user && !!c);
  useResume(access.refetch, !!user && !!c);
  const [draft, setDraft] = useDraft(`reply:${id}`, {
    subject: "",
    body: "",
    category: "technical",
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(),
    [invalid, setInvalid] = useState(false),
    [saved, setSaved] = useState(false),
    [refreshed, setRefreshed] = useState(false);
  const lock = useRef(false),
    errorRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error || invalid) errorRef.current?.focus();
  }, [error, invalid]);
  const [refreshing, setRefreshing] = useState(false);
  const denied = terminalRead(feed.error) || terminalRead(record.error);
  const readable = c && !denied && !refreshing;
  async function refresh() {
    setRefreshed(false);
    setRefreshing(true);
    const owner = user?.id;
    if (!c) {
      await record.refetch();
      setRefreshing(false);
      return;
    }
    await client.cancelQueries({ queryKey: feedKey, exact: true });
    client.setQueryData<Feed>(feedKey, { items: [], cursor: null, more: true });
    const result = await Promise.all([
      record.refetch(),
      feed.refetch(),
      access.refetch(),
    ]);
    if (
      controller.getSnapshot().user?.id === owner &&
      result.every((r) => !r.isError)
    )
      setRefreshed(true);
    setRefreshing(false);
  }
  async function write(kind: "message" | "metadata", body: unknown) {
    if (
      lock.current ||
      draft.uncertain ||
      !readable ||
      feed.isError ||
      (kind === "metadata" && !access.data)
    )
      return;
    lock.current = true;
    setBusy(true);
    setSaved(false);
    setError(undefined);
    setInvalid(false);
    setRefreshed(false);
    const owner = user?.id;
    try {
      const raw = await controller.request(
        kind === "message" ? `${casePath(id)}/messages` : casePath(id),
        { method: kind === "message" ? "POST" : "PATCH", body },
      );
      if (controller.getSnapshot().user?.id !== owner) return;
      if (kind === "message") {
        const message = parseMessage(raw);
        if (message.case_id !== id || message.author_id !== owner)
          throw new Error("invalid_message_response");
        client.setQueryData<Feed>(feedKey, (old) => ({
          items: mergeMessages(old?.items ?? [], [message]),
          cursor: old?.cursor ?? null,
          more: old?.more ?? true,
        }));
        setDraft({ ...draft, body: "", uncertain: false });
      } else {
        const updated = parseCase(raw);
        if (updated.id !== id) throw new Error("invalid_case_response");
      }
      setSaved(true);
      await Promise.all([record.refetch(), feed.refetch()]);
    } catch (e) {
      if (controller.getSnapshot().user?.id === owner) {
        setError(e);
        if (!definiteFailure(e)) setDraft({ ...draft, uncertain: true });
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="support-page">
      <BackLink to="/support">{t.back}</BackLink>
      <header className="title-row spread">
        <h1>{readable ? c.subject : t.title}</h1>
        <button
          className="secondary"
          disabled={record.isFetching || feed.isFetching || busy || refreshing}
          onClick={() => void refresh()}
        >
          {t.refresh}
        </button>
      </header>
      <div ref={errorRef} tabIndex={-1}>
        <SupportError error={record.error ?? feed.error ?? error} t={t} />
        {invalid && <p role="alert">{t.invalidMessage}</p>}
      </div>
      {record.isPending && <p role="status">{t.loading}</p>}
      {readable && (
        <>
          <p className="case-meta">
            <span className="status-badge">{t.statuses[c.status]}</span>{" "}
            {t.categories[c.category]} · {t.assignee}:{" "}
            {c.assignee_id
              ? c.assignee_id === user?.id
                ? t.you
                : t.assignedOther
              : t.unassigned}
          </p>
          <ContextDetails
            context={{
              ...(c.event_id ? { event_id: c.event_id } : {}),
              ...(c.order_id ? { order_id: c.order_id } : {}),
              ...(c.ticket_id ? { ticket_id: c.ticket_id } : {}),
            }}
            t={t}
          />
          {access.isPending ? (
            <p>{t.permissions}</p>
          ) : access.isError ? (
            <p role="alert">{t.permissionsError}</p>
          ) : access.data ? (
            <Metadata
              key={`${c.status}:${c.assignee_id}`}
              value={c}
              locale={locale}
              busy={busy || !!draft.uncertain || feed.isError}
              save={(body) => void write("metadata", body)}
            />
          ) : (
            <p>{t.readOnly}</p>
          )}
          {saved && <p role="status">{t.saved}</p>}
          <div className="support-thread">
            <h2>{t.history}</h2>
            {feed.isPending && <p>{t.loading}</p>}
            {feed.data && !feed.isError && (
              <>
                <p role="status" className="sr-only">
                  {t.newMessages}: {feed.data.items.length}
                </p>
                {!feed.data.items.length && <p>{t.noMessages}</p>}
                <ol className="support-list">
                  {feed.data.items.map((m) => (
                    <li className="support-message" key={m.id}>
                      <header>
                        <strong>
                          {m.author_id === user?.id ? t.you : t.participant}
                        </strong>
                        <Timestamp value={m.created_at} locale={locale} />
                      </header>
                      <p className="support-body">{m.body}</p>
                    </li>
                  ))}
                </ol>
                {feed.data.more && (
                  <>
                    <p>{t.more}</p>
                    <button
                      disabled={feed.isFetching}
                      onClick={() => void feed.refetch()}
                    >
                      {t.loadMore}
                    </button>
                  </>
                )}
              </>
            )}
          </div>
          {draft.uncertain && (
            <div className="support-card">
              <p role="alert">{t.unknown}</p>
              <p>{t.refreshFirst}</p>
              <button
                disabled={!refreshed || record.isFetching || feed.isFetching}
                onClick={() => {
                  setDraft({ ...draft, uncertain: false });
                  setError(undefined);
                }}
              >
                {t.checked}
              </button>
            </div>
          )}
          <form
            className="support-compose"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              let body;
              try {
                body = messageBody(draft.body);
              } catch {
                setInvalid(true);
                return;
              }
              void write("message", body);
            }}
          >
            <label htmlFor="reply-body">{t.message}</label>
            <textarea
              id="reply-body"
              maxLength={5000}
              required
              disabled={
                busy || draft.uncertain || feed.isError || feed.isPending
              }
              value={draft.body}
              onChange={(e) => setDraft({ ...draft, body: e.target.value })}
            />
            <button
              disabled={
                busy || draft.uncertain || feed.isError || feed.isPending
              }
            >
              {busy ? t.working : t.send}
            </button>
          </form>
        </>
      )}
    </section>
  );
}
function Metadata({
  value,
  locale,
  busy,
  save,
}: {
  value: Case;
  locale: Locale;
  busy: boolean;
  save: (body: unknown) => void;
}) {
  const t = supportCopy[locale],
    { user } = useSession();
  const [status, setStatus] = useState(value.status),
    [assignee, setAssignee] = useState(value.assignee_id ?? "");
  const roster = useLiveQuery(
    value.event_id ? staffPath(value.event_id) : "",
    parseStaff,
    30000,
    !!value.event_id && value.audience === "attendee_case",
  );
  const choices = (roster.isError ? [] : (roster.data ?? [])).filter(
    (m) => ["support", "manager"].includes(m.role) && m.user_id !== user?.id,
  );
  return (
    <form
      className="support-card support-metadata"
      onSubmit={(e) => {
        e.preventDefault();
        save({ status, assignee_id: assignee || null });
      }}
    >
      <fieldset disabled={busy} className="metadata-row">
        <legend className="visually-hidden">
          {t.status} / {t.assignee}
        </legend>
        <div>
          <label htmlFor="manage-status">{t.status}</label>
          <select
            id="manage-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as CaseStatus)}
          >
            {statuses.map((s) => (
              <option value={s} key={s}>
                {t.statuses[s]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="manage-assignee">{t.chooseAssignee}</label>
          <select
            id="manage-assignee"
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
          >
            <option value="">{t.unassign}</option>
            <option value={user?.id}>{t.claim}</option>
            {value.assignee_id &&
              value.assignee_id !== user?.id &&
              !choices.some((m) => m.user_id === value.assignee_id) && (
                <option value={value.assignee_id}>{t.assignedOther}</option>
              )}
            {choices.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.full_name} · {m.email}
              </option>
            ))}
          </select>
        </div>
        <button>{busy ? t.working : t.save}</button>
      </fieldset>
    </form>
  );
}
