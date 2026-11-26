import { useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { queryKeys } from "@biletflow/shared/features/query-keys";
import { supportCopy } from "@biletflow/shared/features/support/copy";
import {
  canHandle, casePath, categories, contextFrom, createBody, messageBody, noticeLink,
  parseCase, parseCases, parseMessage, parseNotice, parseNotices, readMessages, statuses, supportLink,
} from "@biletflow/shared/features/support/model";
import type { Case, CaseStatus, Category, Context, Feed } from "@biletflow/shared/features/support/model";
import { parseStaff, staffPath } from "@biletflow/shared/features/staff/model";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { Failure, Read, request, useResource } from "../features/resource";
import { RecordPage } from "../features/PageNav";
import { useWrite } from "../features/use-write";
import { Select } from "../kit/Select";
import { useSessionSnapshot } from "../session";
import { Action, Body, Callout, Card, Heading, Muted, Pill, Screen, Title } from "../ui";

type Props = { locale: Locale; open: (path: string) => void };
const unreadPath = "/api/v1/me/notifications?unread_only=true&limit=1&offset=0";

export function useUnreadCount() {
  const { user } = useSessionSnapshot();
  return useQuery({
    queryKey: queryKeys.support(user?.id, unreadPath),
    queryFn: async ({ signal }) => parseNotices(await request(unreadPath, { signal })),
    enabled: Boolean(user),
    refetchInterval: 15000,
  }).data?.total ?? 0;
}

export function Notifications({ locale, open }: Props) {
  const { user } = useSessionSnapshot();
  const client = useQueryClient();
  const t = supportCopy[locale];
  const [offset, setOffset] = useState(0);
  const [unread, setUnread] = useState(false);
  const path = `/api/v1/me/notifications?limit=20&offset=${offset}&unread_only=${unread}`;
  const records = useResource(path, parseNotices, { key: queryKeys.support(user?.id, path) });
  const write = useWrite("notifications:read");
  return (
    <RecordPage title={t.notifications} empty={t.empty} locale={locale} resource={records} change={setOffset}
      header={<>
        <Action title={unread ? t.allNotices : t.unreadOnly} onPress={() => { setUnread(!unread); setOffset(0); }} />
        <Failure error={write.error} locale={locale} />
      </>}
      render={(notice) => {
        const link = noticeLink(notice, user?.role ?? "");
        return <Card key={notice.id}>
          <Heading>{notice.title}</Heading>
          <Body>{notice.body}</Body>
          <Muted>{formatDateTime(notice.created_at, locale, { time: true })}</Muted>
          <Pill label={notice.read_at ? t.read : t.unread} tone={notice.read_at ? "neutral" : "primary"} />
          {link ? <Action title={t.open} onPress={() => open(link)} /> : null}
          {!notice.read_at ? <Action title={t.markRead} disabled={write.busy} onPress={() => void write.run(async () => {
            const updated = parseNotice(await request(`/api/v1/me/notifications/${encodeURIComponent(notice.id)}/read`, { method: "POST" }));
            if (updated.id !== notice.id || !updated.read_at) throw new Error("invalid notification");
            await client.invalidateQueries({ queryKey: ["f9", user?.id] });
          }, true)} /> : null}
        </Card>;
      }} />
  );
}

export function Support({ locale, open }: Props) {
  const t = supportCopy[locale];
  const [role, setRole] = useState("all");
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);
  const params = new URLSearchParams({ role, limit: "20", offset: String(offset) });
  if (status) params.set("status", status);
  const records = useResource(`/api/v1/support/cases?${params}`, parseCases);
  return (
    <RecordPage title={t.title} empty={t.empty} locale={locale} resource={records} change={setOffset}
      header={<>
        <Action title={t.newCase} variant="primary" onPress={() => open(supportLink())} />
        <Select label={t.inbox} locale={locale} value={role}
          options={[{ value: "all", label: t.all }, { value: "requester", label: t.mine }, { value: "handler", label: t.handler }]}
          onChange={(value) => { setRole(value); setOffset(0); }} />
        <Select label={t.status} locale={locale} value={status}
          options={[{ value: "", label: t.allStatuses }, ...statuses.map((value) => ({ value, label: t.statuses[value] }))]}
          onChange={(value) => { setStatus(value); setOffset(0); }} />
      </>}
      render={(item) => <Card key={item.id}>
        <Heading>{item.subject}</Heading>
        <Pill label={t.statuses[item.status]} />
        <Muted>{t.categories[item.category]}</Muted>
        <Action title={t.open} onPress={() => open(`/support/cases/${encodeURIComponent(item.id)}`)} />
      </Card>} />
  );
}

export function NewCase({ locale, open, search }: Props & { search: string }) {
  const t = supportCopy[locale];
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState<Category>("technical");
  const [matched, setMatched] = useState(false);
  const write = useWrite(`support:new:${search}`);
  const { user } = useSessionSnapshot();
  const discard = useDiscardChanges(Boolean(subject || body) && !write.saved, locale);
  const inbox = useResource("/api/v1/support/cases?role=requester&limit=20&offset=0", parseCases, { enabled: write.uncertain });
  let context: Context;
  try { context = contextFrom(search); } catch {
    return <Screen><Callout tone="warning">{t.invalidContext}</Callout></Screen>;
  }
  return (
    <Screen>
      <Title>{t.newCase}</Title>
      <Muted>{t.contextHint}</Muted>
      {context.event_id ? <Muted>{t.event} {context.event_id}</Muted> : null}
      {context.order_id ? <Muted>{t.order} {context.order_id}</Muted> : null}
      {context.ticket_id ? <Muted>{t.ticket} {context.ticket_id}</Muted> : null}
      <Select label={t.category} locale={locale} value={category}
        options={categories.map((value) => ({ value, label: t.categories[value] }))} onChange={setCategory} disabled={write.busy} />
      <AuthField label={t.subject} value={subject} onChangeText={setSubject} maxLength={200} editable={!write.busy} />
      <AuthField label={t.message} value={body} onChangeText={setBody} maxLength={5000} multiline editable={!write.busy} />
      <Action title={t.create} variant="primary" busy={write.busy} disabled={write.busy || write.uncertain || !subject.trim() || !body.trim()}
        onPress={() => void write.run(async () => {
          const result = parseCase(await request("/api/v1/support/cases", {
            method: "POST", body: createBody({ subject, body, category }, context),
          }));
          if (result.requester_id !== user?.id) throw new Error("invalid requester");
          return result;
        }).then((result) => {
          if (!result) return;
          setSubject("");
          setBody("");
          open(`/support/cases/${encodeURIComponent(result.id)}`);
        })} />
      <Failure error={write.error} locale={locale} />
      {write.uncertain ? <>
        <Callout tone="warning">{t.unknown}</Callout>
        <Action title={t.refresh} onPress={() => void inbox.refetch().then((result) => setMatched(!result.isError))} />
        {inbox.data?.items.map((item) => <Action key={item.id} title={item.subject}
          onPress={() => open(`/support/cases/${encodeURIComponent(item.id)}`)} />)}
        <Action title={t.checked} disabled={!matched} onPress={write.clearUncertain} />
      </> : null}
      {discard}
    </Screen>
  );
}

export function Thread({ id, locale, open }: Props & { id: string }) {
  const t = supportCopy[locale];
  const { user } = useSessionSnapshot();
  const focused = useIsFocused();
  const client = useQueryClient();
  const path = casePath(id);
  const record = useResource(path, parseCase);
  const [body, setBody] = useState("");
  const [checked, setChecked] = useState(false);
  const write = useWrite(`support:thread:${id}`);
  const discard = useDiscardChanges(Boolean(body.trim()), locale);
  const feedKey = ["mobile-messages", user?.id, id];
  const feed = useQuery({
    queryKey: feedKey,
    queryFn: ({ signal }) => readMessages(request, id, client.getQueryData<Feed>(feedKey), signal),
    refetchInterval: focused ? 5000 : false,
    enabled: Boolean(record.data) && !record.isError,
  });
  const permission = useQuery({
    queryKey: queryKeys.supportHandler(user?.id, id, record.data?.status),
    queryFn: ({ signal }) => canHandle(request, record.data!, signal),
    enabled: Boolean(record.data) && !record.isError,
  });
  const refresh = () => Promise.all([record.refetch(), feed.refetch()]);
  return (
    <Screen>
      <Title>{record.data?.subject ?? t.title}</Title>
      <Read resource={record} locale={locale}>{(item) => <>
        <Pill label={t.statuses[item.status]} />
        <Muted>{t.categories[item.category]}</Muted>
        {item.event_id ? <Action title={t.openEvent} onPress={() => open(`/events/${encodeURIComponent(item.event_id!)}`)} /> : null}
        {item.order_id ? <Action title={t.order} onPress={() => open(`/account/orders/${encodeURIComponent(item.order_id!)}`)} /> : null}
        {item.ticket_id ? <Action title={t.ticket} onPress={() => open(`/account/tickets/${encodeURIComponent(item.ticket_id!)}`)} /> : null}
        <Heading>{t.history}</Heading>
        <Read resource={feed} locale={locale}>{(value) => <>
          {value.items.length ? value.items.map((message) => <Card key={message.id}>
            <Heading>{message.author_id === user?.id ? t.you : t.participant}</Heading>
            <Body>{message.body}</Body>
            <Muted>{formatDateTime(message.created_at, locale, { time: true })}</Muted>
          </Card>) : <Muted>{t.noMessages}</Muted>}
          {value.more ? <Action title={t.loadMore} onPress={() => void feed.refetch()} /> : null}
        </>}</Read>
        <AuthField label={t.message} value={body} onChangeText={setBody} maxLength={5000} multiline editable={!write.busy} />
        <Action title={t.send} variant="primary" busy={write.busy}
          disabled={write.busy || write.uncertain || !body.trim() || !feed.data || feed.isError} onPress={() => void write.run(async () => {
            const result = parseMessage(await request(`${path}/messages`, { method: "POST", body: messageBody(body) }));
            if (result.case_id !== id || result.author_id !== user?.id) throw new Error("invalid message");
            setBody("");
            await refresh();
          })} />
        {permission.data ? <Metadata key={`${item.status}:${item.assignee_id}`} item={item} locale={locale}
          busy={write.busy || write.uncertain} save={(value) => void write.run(async () => {
            const result = parseCase(await request(path, { method: "PATCH", body: value }));
            if (result.id !== id) throw new Error("invalid support case");
            await refresh();
          })} /> : null}
        <Failure error={write.error} locale={locale} />
        {write.uncertain ? <Callout tone="warning">{t.unknown}</Callout> : null}
        <Action title={t.refresh} onPress={() => void refresh().then((results) => setChecked(results.every((result) => !result.isError)))} />
        {write.uncertain ? <Action title={t.checked} disabled={!checked} onPress={() => { setChecked(false); write.clearUncertain(); }} /> : null}
      </>}</Read>
      {discard}
    </Screen>
  );
}

function Metadata({ item, locale, busy, save }: { item: Case; locale: Locale; busy: boolean;
  save: (value: { status: CaseStatus; assignee_id: string | null }) => void }) {
  const { user } = useSessionSnapshot();
  const t = supportCopy[locale];
  const [status, setStatus] = useState(item.status);
  const [assignee, setAssignee] = useState(item.assignee_id ?? "");
  const roster = useResource(item.event_id && item.audience === "attendee_case" ? staffPath(item.event_id) : "", parseStaff);
  const options = [{ value: "", label: t.unassign }, ...(user ? [{ value: user.id, label: t.claim }] : []),
    ...(roster.data ?? []).filter((entry) => entry.user_id !== user?.id && ["support", "manager"].includes(entry.role))
      .map((entry) => ({ value: entry.user_id, label: entry.full_name }))];
  if (item.assignee_id && !options.some(({ value }) => value === item.assignee_id)) {
    options.push({ value: item.assignee_id, label: t.assignedOther });
  }
  return <Card>
    <Select label={t.status} locale={locale} value={status} onChange={setStatus} disabled={busy}
      options={statuses.map((value) => ({ value, label: t.statuses[value] }))} />
    <Select label={t.chooseAssignee} locale={locale} value={assignee} onChange={setAssignee} disabled={busy} options={options} />
    <Action title={t.save} disabled={busy} onPress={() => save({ status, assignee_id: assignee || null })} />
  </Card>;
}
