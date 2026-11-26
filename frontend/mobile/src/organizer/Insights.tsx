import { useState } from "react";
import Svg, { Rect } from "react-native-svg";
import { formatEventDateTime, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { parseEvent, parseTicketTypes } from "@biletflow/shared/features/events/contracts";
import { actionLabel } from "@biletflow/shared/features/insights/actions";
import { label } from "@biletflow/shared/features/insights/copy";
import { analyticsQuery, categories, dateQuery, parseAnalytics, parseHistory } from "@biletflow/shared/features/insights/model";
import { AuthField } from "../auth/Fields";
import { DateRange, emptyRange, rangeParams } from "../features/DateRange";
import { PageNav } from "../features/PageNav";
import { Failure, Read, useResource } from "../features/resource";
import { Select } from "../kit/Select";
import { useSessionSnapshot } from "../session";
import { color } from "../theme";
import { Action, Body, Callout, Card, Heading, Muted, Screen, Title } from "../ui";
import { eventRoot } from "./Events";

export function Insights({ id, locale, history = false }: { id: string; locale: Locale; history?: boolean }) {
  const t = (key: string) => label(locale, key);
  const event = useResource(eventRoot(id), parseEvent);
  return <Screen>
    <Title>{t(history ? "history" : "analytics")}</Title>
    <Read resource={event} locale={locale}>{(value) => <>
      <Muted>{value.title}</Muted>
      <Report id={value.id} zone={value.timezone} locale={locale} history={history} />
    </>}</Read>
  </Screen>;
}

function Report({ id, zone, locale, history }: { id: string; zone: string; locale: Locale; history: boolean }) {
  const t = (key: string) => label(locale, key);
  const { user } = useSessionSnapshot();
  const [range, setRange] = useState(emptyRange);
  const [type, setType] = useState("");
  const [category, setCategory] = useState("");
  const [action, setAction] = useState("");
  const [params, setParams] = useState("");
  const [invalid, setInvalid] = useState(false);
  const [offset, setOffset] = useState(0);
  const root = eventRoot(id);
  const types = useResource(history ? "" : `${root}/ticket-types`, parseTicketTypes);
  const analytics = useResource(history ? "" : `${root}/analytics?${params}`, parseAnalytics);
  const audit = useResource(history ? `${root}/history?limit=20&offset=${offset}&${params}` : "", parseHistory);
  function apply() {
    try {
      const input = rangeParams(range, zone);
      if (type) input.set("ticket_type_id", type);
      const query = history ? dateQuery(input, zone) : analyticsQuery(input, zone);
      if (history) {
        if (category) query.set("category", category);
        if (action.trim()) query.set("action_type", action.trim());
      }
      setParams(String(query));
      setOffset(0);
      setInvalid(false);
    } catch {
      setInvalid(true);
    }
  }
  return <>
    <DateRange range={range} change={setRange} zone={zone} locale={locale} />
    {history ? <>
      <Select label={t("category")} locale={locale} value={category} onChange={setCategory}
        options={["", ...categories].map((value) => ({ value, label: t(value || "all") }))} />
      <AuthField label={t("action_type")} value={action} onChangeText={setAction} maxLength={100} />
    </> : <>
      <Failure error={types.error} locale={locale} retry={() => void types.refetch()} />
      <Select label={t("ticketType")} locale={locale} value={type} onChange={setType}
        options={[{ value: "", label: t("all") }, ...(types.data?.items ?? []).map((value) => ({ value: value.id, label: value.name }))]} />
    </>}
    {invalid ? <Callout tone="warning">{t("invalid")}</Callout> : null}
    <Action title={t("apply")} variant="primary" onPress={apply} />
    <Action title={t("reset")} onPress={() => {
      setRange(emptyRange); setType(""); setCategory(""); setAction(""); setParams(""); setOffset(0); setInvalid(false);
    }} />
    {history ? <Read resource={audit} locale={locale}>{(page) => <>
      <Muted>{t(page.lifecycle)}</Muted>
      {page.items.length ? page.items.map((item) => <Card key={item.id}>
        <Heading>{actionLabel(item.action_type, locale)}</Heading>
        <Muted>{item.actor_id === user?.id ? t("you") : t(item.actor_role)}</Muted>
        <Muted>{formatEventDateTime(item.occurred_at, zone, locale)}</Muted>
        {locale === "en" && item.description ? <Body>{item.description}</Body> : null}
      </Card>) : <Muted>{t("empty")}</Muted>}
      <PageNav page={page} locale={locale} change={setOffset} />
      <Action title={t("refresh")} disabled={audit.isFetching} onPress={() => void audit.refetch()} />
    </>}</Read> : <Read resource={analytics} locale={locale}>{(value) => <>
      <Card>
        <Heading>{t("attendance")}</Heading>
        {(["capacity", "sold", "remaining", "checked_in", "absent"] as const).map((key) =>
          <Body key={key}>{t(key)} {value[key]}</Body>)}
        <Body>{t("percent_sold")} {value.percent_sold}%</Body>
        <Body>{t("checkin_percent")} {value.checkin_percent}%</Body>
      </Card>
      <Card>
        <Heading>{t("money")}</Heading>
        {(["gross", "discounts", "refunds", "net"] as const).map((key) =>
          <Body key={key}>{t(key)} {formatPrice(value[key], locale)}</Body>)}
      </Card>
      <Card>
        <Heading>{t("sales")}</Heading>
        <Bars title={t("sales")} values={value.sales_over_time.map((row) => row.tickets)} />
        {value.sales_over_time.map((row) => <Muted key={row.date}>{row.date} · {row.tickets} · {formatPrice(row.revenue, locale)}</Muted>)}
      </Card>
      <Card>
        <Heading>{t("comparison")}</Heading>
        <Bars title={t("comparison")} values={value.by_ticket_type.map((row) => row.sold)} />
        {value.by_ticket_type.map((row) => <Muted key={row.ticket_type_id}>{row.name} · {row.sold} · {formatPrice(row.revenue, locale)}</Muted>)}
      </Card>
      <Heading>{t("campaigns")}</Heading>
      {value.campaigns.length ? value.campaigns.map((row) => <Card key={row.campaign_id}>
        <Heading>{row.name}</Heading>
        <Body>{t("redemptions")} {row.redemptions}</Body>
        <Body>{t("revenue")} {formatPrice(row.revenue, locale)}</Body>
      </Card>) : <Muted>{t("empty")}</Muted>}
      <Action title={t("refresh")} disabled={analytics.isFetching} onPress={() => void analytics.refetch()} />
    </>}</Read>}
  </>;
}

function Bars({ title, values }: { title: string; values: number[] }) {
  if (!values.length) return null;
  const max = Math.max(1, ...values);
  return <Svg height={110} width="100%" viewBox={`0 0 ${values.length * 8} 100`} preserveAspectRatio="none" accessibilityLabel={title}>
    {values.map((value, index) => <Rect key={index} x={index * 8} y={100 - (value / max) * 100}
      width={6} height={(value / max) * 100} fill={color.primary} />)}
  </Svg>;
}
