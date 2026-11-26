import { useState } from "react";
import { formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { parseEvent, parseTicketTypes } from "@biletflow/shared/features/events/contracts";
import { priceInput, zonedInput } from "@biletflow/shared/features/events/model";
import { label } from "@biletflow/shared/features/insights/copy";
import { promoCopy } from "@biletflow/shared/features/promotions/copy";
import { campaignBody, campaignPatch, parseCampaign, parseCampaigns, parseReport } from "@biletflow/shared/features/promotions/model";
import type { Campaign } from "@biletflow/shared/features/promotions/model";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { RecordPage } from "../features/PageNav";
import { Failure, Read, request, useResource } from "../features/resource";
import { useWrite } from "../features/use-write";
import { downloadAndShare } from "../files";
import { DateTimeField } from "../kit/DateTimeField";
import { Select } from "../kit/Select";
import { Action, Body, Card, Heading, Muted, Pill } from "../ui";
import { eventRoot } from "./Events";
import type { OrganizerProps } from "./Events";
import { editingAfterSave } from "./campaign-editing";

export function Campaigns({ id, locale, open }: OrganizerProps & { id: string }) {
  const t = promoCopy[locale];
  const root = eventRoot(id);
  const event = useResource(root, parseEvent);
  const types = useResource(`${root}/ticket-types`, parseTicketTypes);
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<Campaign | "new" | null>(null);
  const items = useResource(`${root}/campaigns?limit=20&offset=${offset}`, parseCampaigns);
  const write = useWrite(`campaign:${id}`);

  function save(campaign: Campaign | undefined, body: unknown) {
    void write.run(async () => {
      const result = parseCampaign(await request(campaign ? `/api/v1/campaigns/${encodeURIComponent(campaign.id)}` : `${root}/campaigns`, {
        method: campaign ? "PATCH" : "POST", body,
      }));
      if (result.event_id !== id) throw new Error("wrong event");
      setEditing((current) => editingAfterSave(current, campaign));
      await items.refetch();
    }, Boolean(campaign));
  }

  return <RecordPage title={t.title} empty={t.empty} locale={locale} resource={items} change={setOffset}
    header={<>
      <Muted>{t.intro}</Muted>
      <Failure error={write.error ?? event.error ?? types.error} locale={locale} />
      {write.uncertain ? <Muted>{label(locale, "unknown")}</Muted> : null}
      {editing && event.data && types.data ? <CampaignForm key={editing === "new" ? "new" : editing.id}
        campaign={editing === "new" ? undefined : editing} locale={locale} zone={event.data.timezone}
        types={types.data.items} busy={write.busy || write.uncertain} dismiss={() => setEditing(null)} save={save} /> :
        <Action title={t.create} variant="primary" disabled={!event.data || !types.data || write.uncertain} onPress={() => setEditing("new")} />}
    </>}
    render={(item) => <CampaignCard key={item.id} item={item} locale={locale} open={open}
      edit={() => setEditing(item)} toggle={() => save(item, { is_enabled: !item.is_enabled })} disabled={write.busy || write.uncertain} />} />;
}

function CampaignForm({ campaign, locale, zone, types, busy, dismiss, save }: {
  campaign?: Campaign; locale: Locale; zone: string; types: { id: string; name: string }[];
  busy: boolean; dismiss: () => void; save: (campaign: Campaign | undefined, body: unknown) => void;
}) {
  const t = promoCopy[locale];
  const [name, setName] = useState(campaign?.name ?? "");
  const [kind, setKind] = useState<"percent" | "fixed">(campaign?.discount_type ?? "percent");
  const [value, setValue] = useState(campaign ? campaign.discount_type === "fixed" ? priceInput(campaign.discount_value) : String(campaign.discount_value) : "");
  const [from, setFrom] = useState<string | null>(campaign?.valid_from ?? null);
  const [to, setTo] = useState<string | null>(campaign?.valid_to ?? null);
  const [limit, setLimit] = useState(campaign ? String(campaign.max_redemptions) : "");
  const [eligible, setEligible] = useState(campaign?.ticket_type_ids ?? []);
  const [invalid, setInvalid] = useState(false);
  const discard = useDiscardChanges(Boolean(name || value || from || to || limit), locale);
  return <Card>
    <Heading>{campaign ? t.edit : t.create}</Heading>
    <AuthField label={t.name} value={name} onChangeText={setName} maxLength={200} editable={!busy} />
    <Select label={t.kind} locale={locale} value={kind} onChange={setKind} disabled={busy || Boolean(campaign)}
      options={[{ value: "percent", label: t.percent }, { value: "fixed", label: t.fixed }]} />
    <AuthField label={t.value} value={value} onChangeText={setValue} inputMode="decimal" editable={!busy && !campaign} />
    <DateTimeField label={t.from} zone={zone} value={from} onChange={setFrom} locale={locale} />
    <DateTimeField label={t.to} zone={zone} value={to} onChange={setTo} locale={locale} />
    <AuthField label={t.limit} value={limit} onChangeText={setLimit} inputMode="numeric" editable={!busy} />
    {!campaign ? <>
      <Heading>{t.eligibility}</Heading>
      <Muted>{t.allTypes}</Muted>
      {types.map((item) => <Action key={item.id} title={item.name} disabled={busy}
        variant={eligible.includes(item.id) ? "primary" : "secondary"}
        onPress={() => setEligible((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />)}
    </> : null}
    {invalid ? <Muted>{t.invalid}</Muted> : null}
    <Action title={t.save} variant="primary" busy={busy} disabled={busy} onPress={() => {
      try {
        const values: Record<string, string> = { name, discount_type: kind, discount_value: value, max_redemptions: limit,
          valid_from: from ? zonedInput(from, zone) : "", valid_to: to ? zonedInput(to, zone) : "" };
        const body = campaignBody({ get: (key) => values[key] ?? null, getAll: () => eligible }, zone);
        setInvalid(false);
        save(campaign, campaign ? campaignPatch(body, campaign.is_enabled) : body);
      } catch { setInvalid(true); }
    }} />
    <Action title={t.cancel} onPress={dismiss} disabled={busy} />
    {discard}
  </Card>;
}

function CampaignCard({ item, locale, open, edit, toggle, disabled }: OrganizerProps & {
  item: Campaign; edit: () => void; toggle: () => void; disabled: boolean;
}) {
  const t = promoCopy[locale];
  const [show, setShow] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const path = `/api/v1/campaigns/${encodeURIComponent(item.id)}`;
  const report = useResource(show ? `${path}/report` : "", parseReport);
  return <Card>
    <Heading>{item.name}</Heading>
    <Body>{item.code}</Body>
    <Pill label={item.is_enabled ? t.enabled : t.disabled} />
    <Muted>{item.discount_type === "percent" ? `${item.discount_value}%` : formatPrice(item.discount_value, locale)}</Muted>
    <Action title={t.edit} disabled={disabled} onPress={edit} />
    <Action title={item.is_enabled ? t.disable : t.enable} disabled={disabled} onPress={toggle} />
    <Action title={t.previewEvent} onPress={() => open(`/events/${encodeURIComponent(item.event_id)}?promo=${encodeURIComponent(item.code)}`)} />
    <Action title={t.qr} busy={sharing} disabled={sharing} onPress={() => {
      setSharing(true);
      setError(null);
      void downloadAndShare(`${path}/qr`, item.code, "png").then((result) => {
        if (result === "unavailable") setError(new Error("sharing unavailable"));
      }).catch(setError).finally(() => setSharing(false));
    }} />
    <Failure error={error} locale={locale} />
    <Action title={t.report} onPress={() => setShow(!show)} />
    {show ? <Read resource={report} locale={locale}>{(data) => <>
      <Muted>{t.reportHint}</Muted>
      <Body>{t.used} {data.redemptions} · {t.orders} {data.orders} · {t.tickets} {data.tickets_sold}</Body>
      <Body>{t.gross} {formatPrice(data.gross_revenue, locale)}</Body>
      <Body>{t.discount} {formatPrice(data.discount, locale)}</Body>
      <Body>{t.net} {formatPrice(data.net_revenue, locale)}</Body>
    </>}</Read> : null}
  </Card>;
}
