import { useState } from "react";
import { formatDateTime, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { paymentCopy } from "@biletflow/shared/features/payments/copy";
import {
  accountsPath, activationPath, normalizeIban, parseAccount, parseAccounts, parseActivation, parseFinancials, parsePayouts,
} from "@biletflow/shared/features/payments/model";
import type { Account } from "@biletflow/shared/features/payments/model";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { Payment } from "../checkout/Payment";
import { RecordPage } from "../features/PageNav";
import { Failure, Read, request, useResource } from "../features/resource";
import { useWrite } from "../features/use-write";
import { ConfirmSheet } from "../kit/ConfirmSheet";
import { Select } from "../kit/Select";
import { Action, Body, Callout, Card, Heading, Muted, Pill, Screen, Title } from "../ui";
import { eventRoot, organizerEvent } from "./Events";
import type { OrganizerProps } from "./Events";

export function Activation({ id, locale, open }: OrganizerProps & { id: string }) {
  const t = paymentCopy[locale];
  const path = activationPath(id);
  const record = useResource(path, parseActivation);
  const accounts = useResource(accountsPath, parseAccounts);
  const write = useWrite(`activation:${id}`);
  const [selected, setSelected] = useState("");
  const [terms, setTerms] = useState(false);

  function run(suffix: string, method: "POST" | "PATCH", body?: unknown) {
    void write.run(async () => {
      await request(path + suffix, { method, body });
      await record.refetch();
    }, true);
  }

  return <Screen>
    <Title>{t.activation}</Title>
    <Callout tone="warning">{t.demo}</Callout>
    <Muted>{t.eventOnly}</Muted>
    <Failure error={write.error} locale={locale} />
    <Read resource={record} locale={locale}>{(data) => {
      const suspended = data.status === "suspended";
      return <>
        <Pill label={data.status === "active" ? t.active : suspended ? t.suspended : t.incomplete} />
        {Object.entries(t.steps).map(([key, label]) => <Card key={key}>
          <Heading>{label}</Heading>
          <Pill label={data.missing_steps.includes(key) ? t.missing : t.done} />
          {data.missing_steps.includes(key) && !suspended ? <>
            {key === "paid_ticket_type" ? <Action title={t.viewEvent} onPress={() => open(organizerEvent(id, "edit"))} /> : null}
            {key === "identity_verification" ? <Action title={t.verify} disabled={write.busy} onPress={() => run("/verify-identity", "POST")} /> : null}
            {key === "payout_account" ? <>
              <Read resource={accounts} locale={locale}>{(value) => <>
                <Select label={t.select} locale={locale} value={selected || data.payout_account_id || ""}
                  options={value.filter((account) => account.is_verified).map((account) => ({
                    value: account.id, label: `${account.bank_name} · •••• ${account.iban_last4}`,
                  }))} onChange={setSelected} disabled={write.busy} />
                <Action title={t.attach} disabled={!selected || write.busy} onPress={() => run("", "PATCH", { payout_account_id: selected })} />
              </>}</Read>
              <Action title={t.accounts} onPress={() => open("/organizer/payout-accounts")} />
            </> : null}
            {key === "terms" ? <>
              <Muted>{t.termsNote}</Muted>
              <Action title={t.terms} disabled={write.busy} variant={terms ? "primary" : "secondary"} onPress={() => setTerms(!terms)} />
              <Action title={t.accept} disabled={!terms || write.busy} onPress={() => run("", "PATCH", { accept_terms: true })} />
            </> : null}
            {key === "activation_fee" ? <>
              <Muted>{t.feeQuote}</Muted>
              <Payment locale={locale} startPath={`${path}/pay`} kind="activation_fee" changed={record.refetch} />
            </> : null}
          </> : null}
        </Card>)}
        {data.missing_steps.some((key) => !(key in t.steps)) ? <Muted>{t.unknownStep}</Muted> : null}
      </>;
    }}</Read>
    <Action title={t.refresh} disabled={record.isFetching} onPress={() => { void record.refetch(); void accounts.refetch(); }} />
  </Screen>;
}

export function Accounts({ locale }: { locale: Locale }) {
  const t = paymentCopy[locale];
  const data = useResource(accountsPath, parseAccounts);
  const [editing, setEditing] = useState<Account | "new" | null>(null);
  const [removing, setRemoving] = useState<Account | null>(null);
  const write = useWrite("payout-account:remove");
  return <Screen>
    <Title>{t.accounts}</Title>
    <Callout tone="warning">{t.demo}</Callout>
    <Read resource={data} locale={locale}>{(accounts) => <>
      {accounts.length ? accounts.map((account) => <Card key={account.id}>
        <Heading>{account.bank_name}</Heading>
        <Body>{account.holder_name}</Body>
        <Muted>•••• {account.iban_last4}</Muted>
        <Pill label={account.is_verified ? t.verified : t.unverified} />
        <Action title={t.edit} onPress={() => setEditing(account)} />
        <Action title={t.remove} onPress={() => setRemoving(account)} />
      </Card>) : <Muted>{t.emptyAccounts}</Muted>}
    </>}</Read>
    {editing ? <AccountForm key={editing === "new" ? "new" : editing.id} account={editing === "new" ? undefined : editing}
      locale={locale} close={() => { setEditing(null); void data.refetch(); }} /> :
      <Action title={t.create} variant="primary" onPress={() => setEditing("new")} />}
    <Failure error={write.error} locale={locale} />
    <ConfirmSheet visible={Boolean(removing)} title={t.remove} body={t.confirmRemove} confirmLabel={t.confirm} cancelLabel={t.cancel}
      busy={write.busy} onCancel={() => setRemoving(null)} onConfirm={() => {
        if (!removing) return;
        void write.run(async () => {
          await request(`${accountsPath}/${encodeURIComponent(removing.id)}`, { method: "DELETE" });
          await data.refetch();
        }, true).finally(() => setRemoving(null));
      }} />
  </Screen>;
}

function AccountForm({ account, locale, close }: { account?: Account; locale: Locale; close: () => void }) {
  const t = paymentCopy[locale];
  const [bank, setBank] = useState(account?.bank_name ?? "");
  const [holder, setHolder] = useState(account?.holder_name ?? "");
  const [iban, setIban] = useState("");
  const [invalid, setInvalid] = useState(false);
  const write = useWrite(`payout-account:${account?.id ?? "new"}`);
  const dirty = bank !== (account?.bank_name ?? "") || holder !== (account?.holder_name ?? "") || Boolean(iban);
  const discard = useDiscardChanges(dirty, locale);
  return <Card>
    <Heading>{account ? t.edit : t.create}</Heading>
    <AuthField label={t.bank} value={bank} onChangeText={setBank} maxLength={200} editable={!write.busy} />
    <AuthField label={t.holder} value={holder} onChangeText={setHolder} maxLength={200} editable={!write.busy} />
    <AuthField label={t.iban} value={iban} onChangeText={setIban} hint={t.ibanHint} error={invalid ? t.ibanError : undefined}
      autoCapitalize="characters" autoCorrect={false} maxLength={42} editable={!write.busy} />
    <Action title={t.save} variant="primary" busy={write.busy}
      disabled={write.busy || write.uncertain || !bank.trim() || !holder.trim()} onPress={() => {
        let normalized: string;
        try { normalized = normalizeIban(iban); setInvalid(false); } catch { setInvalid(true); return; }
        void write.run(async () => parseAccount(await request(account ? `${accountsPath}/${encodeURIComponent(account.id)}` : accountsPath, {
          method: account ? "PATCH" : "POST", body: { bank_name: bank.trim(), holder_name: holder.trim(), iban: normalized },
        })), Boolean(account)).then((result) => { if (result) close(); });
      }} />
    <Failure error={write.error} locale={locale} />
    <Action title={t.cancel} disabled={write.busy} onPress={close} />
    {discard}
  </Card>;
}

function Amounts({ lines, locale, currency }: { lines: [string, number][]; locale: Locale; currency: string }) {
  return <>{lines.map(([label, amount]) => <Body key={label}>{label} {formatPrice(amount, locale, currency)}</Body>)}</>;
}

export function Financials({ id, locale }: { id: string; locale: Locale }) {
  const t = paymentCopy[locale];
  const query = useResource(`${eventRoot(id)}/financials`, parseFinancials);
  return <Screen>
    <Title>{t.eventFinances}</Title>
    <Callout tone="warning">{t.demo}</Callout>
    <Read resource={query} locale={locale}>{(record) => <Card>
      <Amounts locale={locale} currency={record.currency}
        lines={[[t.gross, record.gross], [t.fees, record.fees], [t.refunds, record.refunds], [t.estimated, record.estimated_payout]]} />
      <Muted>{t.noBuyerFee}</Muted>
    </Card>}</Read>
    <Action title={t.refresh} disabled={query.isFetching} onPress={() => void query.refetch()} />
  </Screen>;
}

export function Payouts({ locale, open }: OrganizerProps) {
  const t = paymentCopy[locale];
  const [offset, setOffset] = useState(0);
  const query = useResource(`/api/v1/organizers/me/payouts?limit=20&offset=${offset}`, parsePayouts);
  const statuses = { scheduled: t.scheduled, paid: t.paid, failed: t.failed } as const;
  return <RecordPage title={t.payouts} empty={t.emptyPayouts} locale={locale} resource={query} change={setOffset}
    header={<Callout tone="warning">{t.demo}</Callout>}
    render={(record) => <Card key={record.id}>
      <Pill label={statuses[record.status as keyof typeof statuses] ?? t.unavailable} />
      <Muted>{record.paid_at || record.scheduled_for ? formatDateTime((record.paid_at ?? record.scheduled_for)!, locale, { time: true }) : ""}</Muted>
      <Amounts locale={locale} currency={record.currency}
        lines={[[t.gross, record.gross], [t.fees, record.fees], [t.refunds, record.refunds], [t.net, record.net]]} />
      <Action title={t.eventFinances} onPress={() => open(organizerEvent(record.event_id, "financials"))} />
    </Card>} />;
}
