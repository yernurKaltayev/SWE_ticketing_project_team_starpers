import { useRef, useState } from "react";
import { formatDateTime, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { priceInput } from "@biletflow/shared/features/events/model";
import { label } from "@biletflow/shared/features/insights/copy";
import {
  adminFields, adminPath, adminQuery, adminStatuses, exportKinds, exportPath, hasDates, hasSearch,
  moneyFields, parseAdminPage, parseDisputes, parseRow, parseSettings, sections, settingsBody,
} from "@biletflow/shared/features/insights/model";
import type { AdminSection, Row, Settings } from "@biletflow/shared/features/insights/model";
import { queryKeys } from "@biletflow/shared/features/query-keys";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { createdKeys, DateRange, emptyRange, rangeParams } from "../features/DateRange";
import { PageNav } from "../features/PageNav";
import { Failure, Read, request, useResource } from "../features/resource";
import { useWrite } from "../features/use-write";
import { downloadAndShare } from "../files";
import { ConfirmSheet } from "../kit/ConfirmSheet";
import { Select } from "../kit/Select";
import { kitCopy } from "../kit/copy";
import { useSessionSnapshot } from "../session";
import { Action, Body, Callout, Card, Heading, Muted, Screen, Sheet, Title } from "../ui";

type Props = { locale: Locale; open: (path: string) => void };
const adminSections = [...sections, "disputes", "settings", "exports"];

export function Admin({ section = "users", initialEvent, locale, open }: Props & { section?: string; initialEvent?: string }) {
  const t = (key: string) => label(locale, key);
  return <Screen>
    <Title>{t("admin")}</Title>
    <Select label={t("admin")} locale={locale} value={section} onChange={(value) => open(`/admin/${value}`)}
      options={adminSections.map((value) => ({ value, label: t(value) }))} />
    <Callout tone="warning">{t("demo")}</Callout>
    {section === "settings" ? <SettingsPage locale={locale} /> :
      section === "exports" ? <Exports locale={locale} /> :
      section === "disputes" ? <Disputes locale={locale} open={open} /> :
      sections.includes(section as AdminSection) ?
        <Search key={section} section={section as AdminSection} initialEvent={initialEvent} locale={locale} open={open} /> :
        <Muted>{t("empty")}</Muted>}
  </Screen>;
}

type Change = { path: string; title: string; hint: string; method: "POST" | "PATCH";
  body: Record<string, unknown>; response: AdminSection; target: string; sales?: boolean };

function Search({ locale, open, section, initialEvent }: Props & { section: AdminSection; initialEvent?: string }) {
  const t = (key: string) => label(locale, key);
  const { user } = useSessionSnapshot();
  const [term, setTerm] = useState("");
  const [status, setStatus] = useState("");
  const [role, setRole] = useState("");
  const [suspended, setSuspended] = useState("");
  const [eventId, setEventId] = useState(initialEvent ?? "");
  const [range, setRange] = useState(emptyRange);
  const [applied, setApplied] = useState(() => new URLSearchParams(initialEvent && section === "orders" ? { event_id: initialEvent } : {}));
  const [offset, setOffset] = useState(0);
  const [invalid, setInvalid] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [change, setChange] = useState<Change | null>(null);
  const [reason, setReason] = useState("");
  const [checked, setChecked] = useState(false);
  const write = useWrite(`admin:${section}`);
  const discard = useDiscardChanges(Boolean(change && reason.trim()), locale);
  const query = new URLSearchParams(applied.toString());
  query.set("offset", String(offset));
  query.set("limit", "20");
  const path = `${adminPath(section)}?${query}`;
  const records = useResource(path, parseAdminPage(section), { key: queryKeys.admin(user?.id, path), interval: 30000 });

  function apply() {
    try {
      const input = rangeParams(range, "UTC", createdKeys);
      for (const [key, value] of Object.entries({ q: term.trim(), status, role, suspended, event_id: eventId.trim() })) {
        if (value) input.set(key, value);
      }
      setApplied(adminQuery(section, input));
      setOffset(0);
      setSelected(null);
      setInvalid(false);
    } catch { setInvalid(true); }
  }

  function suspend(row: Row, sales = false) {
    if (section !== "users" && section !== "events") return;
    const target = String(row.id);
    const value = sales ? row.paid_sales_status !== "suspended" : section === "users" ? !row.is_suspended : row.status !== "suspended";
    setReason("");
    setChange({
      path: `/api/v1/admin/${section}/${encodeURIComponent(target)}/${sales ? "paid-sales/suspend" : "suspend"}`,
      method: "POST", body: { suspended: value }, target, response: sales ? "activations" : section, sales,
      title: t(sales ? value ? "suspendSales" : "resumeSales" : value ? "suspend" : "reinstate"),
      hint: t(section === "users" ? "userSuspendHint" : sales ? "salesHint" : "suspensionHint"),
    });
  }

  const choice = (value: string) => ({ value, label: t(value || "all") });
  return <>
    <Heading>{t(section)}</Heading>
    {hasSearch(section) ? <AuthField label={t("search")} value={term} maxLength={200} onChangeText={setTerm} /> : null}
    {adminStatuses[section] ? <Select label={t("status")} value={status} locale={locale} onChange={setStatus}
      options={["", ...adminStatuses[section]!].map(choice)} /> : null}
    {section === "users" ? <>
      <Select label={t("role")} value={role} locale={locale} onChange={setRole}
        options={["", "attendee", "organizer", "platform_admin"].map(choice)} />
      <Select label={t("is_suspended")} value={suspended} locale={locale} onChange={setSuspended}
        options={[choice(""), { value: "true", label: t("yes") }, { value: "false", label: t("no") }]} />
    </> : null}
    {section === "orders" ? <AuthField label={t("event_id")} value={eventId} onChangeText={setEventId} autoCapitalize="none" /> : null}
    {hasDates(section) ? <DateRange range={range} change={setRange} zone="UTC" locale={locale} keys={createdKeys} /> : null}
    {invalid ? <Callout tone="warning">{t("invalid")}</Callout> : null}
    <Action title={t("apply")} variant="primary" onPress={apply} />
    <Action title={t("reset")} onPress={() => {
      setTerm(""); setRole(""); setStatus(""); setSuspended(""); setEventId(""); setRange(emptyRange);
      setApplied(new URLSearchParams()); setOffset(0); setSelected(null); setInvalid(false);
    }} />
    <Action title={t("refresh")} disabled={write.busy} onPress={() => void records.refetch().then((result) => setChecked(!result.isError))} />
    <Failure error={write.error} locale={locale} />
    {write.uncertain ? <>
      <Callout tone="warning">{t("unknown")}</Callout>
      <Action title={t("checkedRecords")} disabled={!checked} onPress={() => { setChecked(false); write.clearUncertain(); }} />
    </> : null}
    <Read resource={records} locale={locale}>{(page) => <>
      {page.items.length ? page.items.map((row) => {
        const key = String(row.id ?? row.campaign_id);
        const expanded = selected === key;
        return <Card key={key}>
          <Heading>{String(row.title ?? row.full_name ?? row.subject ?? row.order_number ?? row.name ?? key)}</Heading>
          {row.status ? <Muted>{t(String(row.status))}</Muted> : null}
          <Action title={expanded ? kitCopy[locale].close : t("details")} onPress={() => setSelected(expanded ? null : key)} />
          {expanded ? <>
            <Fields row={row} section={section} locale={locale} />
            {section === "users" || section === "events" ?
              <Action title={row.is_suspended || row.status === "suspended" ? t("reinstate") : t("suspend")}
                disabled={write.busy || write.uncertain} onPress={() => suspend(row)} /> : null}
            {section === "events" ? <>
              <Action title={row.paid_sales_status === "suspended" ? t("resumeSales") : t("suspendSales")}
                disabled={write.busy || write.uncertain} onPress={() => suspend(row, true)} />
              <Action title={t("orders")} onPress={() => open(`/admin/orders?event_id=${encodeURIComponent(key)}`)} />
            </> : null}
            {section === "support" ? <Action title={t("support")} onPress={() => open(`/support/cases/${encodeURIComponent(key)}`)} /> : null}
            {section === "reports" ? ["reviewed", "dismissed", "actioned"].filter((value) => value !== row.status).map((value) =>
              <Action key={value} title={t(value)} disabled={write.busy || write.uncertain} onPress={() => setChange({
                path: `/api/v1/admin/reports/${encodeURIComponent(key)}`, method: "PATCH", body: { status: value }, target: key,
                response: "reports", title: t(value), hint: t("moderationHint"),
              })} />) : null}
          </> : null}
        </Card>;
      }) : <Muted>{t("empty")}</Muted>}
      <PageNav page={page} locale={locale} change={(value) => { setOffset(value); setSelected(null); }} />
    </>}</Read>
    <Sheet visible={Boolean(change)} onClose={() => { if (!write.busy) setChange(null); }}>
      <Heading>{change?.title}</Heading>
      <Muted>{change?.hint}</Muted>
      {change?.method === "POST" ? <AuthField label={t("reason")} value={reason} onChangeText={setReason} maxLength={500} multiline editable={!write.busy} /> : null}
      <Action title={t("confirm")} variant="primary" busy={write.busy}
        disabled={write.busy || write.uncertain || (change?.method === "POST" && !reason.trim())}
        onPress={() => {
          if (!change) return;
          setChecked(false);
          void write.run(async () => {
            const result = parseRow(change.response, await request(change.path, {
              method: change.method, body: { ...change.body, ...(change.method === "POST" ? { reason: reason.trim() } : {}) },
            }));
            if (result[change.sales ? "event_id" : "id"] !== change.target) throw new Error("wrong target");
            return result;
          }).then((result) => {
            setChange(null);
            setReason("");
            if (result) { setSelected(null); void records.refetch(); }
          });
        }} />
      <Action title={kitCopy[locale].cancel} disabled={write.busy} onPress={() => setChange(null)} />
    </Sheet>
    {discard}
  </>;
}

function Fields({ row, section, locale }: { row: Row; section: AdminSection; locale: Locale }) {
  const t = (key: string) => label(locale, key);
  return <>{adminFields(section).map((field) => {
    const value = row[field];
    if (value == null) return null;
    const text = typeof value === "boolean" ? t(value ? "yes" : "no") :
      typeof value === "number" && moneyFields.has(field) ? formatPrice(value, locale) :
      typeof value === "string" && field.endsWith("_at") ? formatDateTime(value, locale, { time: true }) :
      ["status", "role", "category", "audience", "paid_sales_status"].includes(field) ? t(String(value)) : String(value);
    return <Body key={field}>{t(field)} · {text}</Body>;
  })}</>;
}

function Disputes({ locale, open }: Props) {
  const t = (key: string) => label(locale, key);
  const query = useResource("/api/v1/admin/disputes?limit=100", parseDisputes, { interval: 30000 });
  return <>
    <Heading>{t("disputes")}</Heading>
    <Action title={t("refresh")} disabled={query.isFetching} onPress={() => void query.refetch()} />
    <Read resource={query} locale={locale}>{(value) => <>
      <Heading>{t("refunds")}</Heading>
      {value.failed_refunds.length ? value.failed_refunds.map((row) => <Card key={String(row.id)}>
        <Fields row={row} section="refunds" locale={locale} />
      </Card>) : <Muted>{t("empty")}</Muted>}
      <Heading>{t("support")}</Heading>
      {value.payment_cases.length ? value.payment_cases.map((row) => <Card key={String(row.id)}>
        <Fields row={row} section="support" locale={locale} />
        <Action title={t("support")} onPress={() => open(`/support/cases/${encodeURIComponent(String(row.id))}`)} />
      </Card>) : <Muted>{t("empty")}</Muted>}
    </>}</Read>
  </>;
}

const settingsPath = "/api/v1/admin/settings";
function SettingsPage({ locale }: { locale: Locale }) {
  const { user } = useSessionSnapshot();
  const query = useResource(settingsPath, parseSettings, { key: queryKeys.admin(user?.id, "settings") });
  return <>
    <Heading>{label(locale, "settings")}</Heading>
    <Read resource={query} locale={locale}>{(data) =>
      <SettingsForm key={JSON.stringify(data)} current={data} locale={locale} refresh={async () => !(await query.refetch()).isError} />
    }</Read>
  </>;
}

const settingsFields = ["activation_fee_amount", "processing_fee_percent", "payout_delay_days", "hold_minutes"] as const;
function SettingsForm({ locale, current, refresh }: { locale: Locale; current: Settings; refresh: () => Promise<boolean> }) {
  const t = (key: string) => label(locale, key);
  const [values, setValues] = useState(() => ({
    activation_fee_amount: priceInput(current.activation_fee_amount),
    processing_fee_percent: String(current.processing_fee_percent), payout_delay_days: String(current.payout_delay_days),
    hold_minutes: String(current.hold_minutes),
  }));
  const [pending, setPending] = useState<ReturnType<typeof settingsBody> | null>(null);
  const [invalid, setInvalid] = useState(false);
  const [checked, setChecked] = useState(false);
  const write = useWrite("admin:settings");
  const dirty = settingsFields.some((key) => values[key] !== (key === "activation_fee_amount" ? priceInput(current[key]) : String(current[key])));
  const discard = useDiscardChanges(dirty, locale);
  return <>
    {settingsFields.map((key) => <AuthField key={key} label={t(key)} value={values[key]}
      inputMode={key === "activation_fee_amount" || key === "processing_fee_percent" ? "decimal" : "numeric"}
      editable={!write.busy && !write.uncertain} onChangeText={(value) => setValues((old) => ({ ...old, [key]: value }))} />)}
    {invalid ? <Callout tone="warning">{t("noChanges")}</Callout> : null}
    <Failure error={write.error} locale={locale} />
    {write.saved ? <Muted>{t("saved")}</Muted> : null}
    <Action title={t("save")} variant="primary" disabled={write.busy || write.uncertain || !dirty} onPress={() => {
      try {
        const body = settingsBody({ get: (key) => values[key as keyof typeof values] ?? null }, current);
        setPending(body);
        setInvalid(false);
      } catch { setInvalid(true); }
    }} />
    <Action title={t("refresh")} disabled={write.busy} onPress={() => void refresh().then(setChecked)} />
    {write.uncertain ? <>
      <Callout tone="warning">{t("unknown")}</Callout>
      <Action title={t("checkedRecords")} disabled={!checked} onPress={() => { write.clearUncertain(); setChecked(false); }} />
    </> : null}
    <ConfirmSheet visible={Boolean(pending)} title={t("settings")}
      body={settingsFields.filter((key) => pending?.settings[key] !== undefined).map((key) => {
        const before = key === "activation_fee_amount" ? formatPrice(current[key], locale) : current[key];
        const after = key === "activation_fee_amount" ? formatPrice(pending!.settings[key]!, locale) : pending!.settings[key];
        return `${t(key)} · ${t("before")} ${before} → ${t("after")} ${after}`;
      }).join("\n")}
      confirmLabel={t("confirm")} cancelLabel={kitCopy[locale].cancel} busy={write.busy} onCancel={() => setPending(null)}
      onConfirm={() => {
        if (!pending) return;
        setChecked(false);
        void write.run(async () => parseSettings(await request(settingsPath, { method: "PATCH", body: pending })))
          .then((result) => { setPending(null); if (result) void refresh(); });
      }} />
    {discard}
  </>;
}

function Exports({ locale }: { locale: Locale }) {
  const t = (key: string) => label(locale, key);
  const [kind, setKind] = useState<string>("orders");
  const [range, setRange] = useState(emptyRange);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [invalid, setInvalid] = useState(false);
  const flight = useRef(false);
  return <>
    <Heading>{t("exports")}</Heading>
    <Muted>{t("exportHint")}</Muted>
    <Select label={t("exports")} value={kind} onChange={setKind} disabled={busy} locale={locale}
      options={exportKinds.map((value) => ({ value, label: t(value) }))} />
    <DateRange range={range} change={setRange} zone="UTC" locale={locale} keys={createdKeys} />
    {invalid ? <Muted>{t("invalid")}</Muted> : null}
    <Failure error={error} locale={locale} />
    <Action title={t(busy ? "working" : "export")} variant="primary" busy={busy} disabled={busy} onPress={() => {
      if (flight.current) return;
      let path: string;
      try { path = exportPath(kind, rangeParams(range, "UTC", createdKeys)); setInvalid(false); }
      catch { setInvalid(true); return; }
      flight.current = true;
      setBusy(true);
      setError(null);
      void downloadAndShare(path, kind, "csv").then((result) => {
        if (result === "unavailable") setError(new Error("sharing unavailable"));
      }).catch(setError).finally(() => { flight.current = false; setBusy(false); });
    }} />
  </>;
}
