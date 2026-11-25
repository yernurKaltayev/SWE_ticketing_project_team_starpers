import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ApiError, formatMoney, formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useEventRequest, useResource } from "../events/data";
import { parseEvent } from "../events/contracts";
import { useCampaignTypes } from "./data";
import { zonedInput, priceInput } from "../events/model";
import { Field } from "../auth/ui";
import { validateBinary } from "../checkout/model";
import { promoCopy } from "./copy";
import {
  campaignBody,
  campaignPatch,
  parseCampaign,
  parseCampaigns,
  parseReport,
} from "./model";
import type { Campaign } from "./model";
import "./promotions.css";
import { BackLink } from "../BackLink";
export default function Campaigns({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  return <Workspace key={eventId} eventId={eventId} locale={locale} />;
}
function Workspace({ eventId, locale }: { eventId: string; locale: Locale }) {
  const request = useEventRequest(),
    t = promoCopy[locale];
  const root = `/api/v1/events/${encodeURIComponent(eventId)}`;
  const event = useResource(root, parseEvent);
  const types = useCampaignTypes(`${root}/ticket-types`);
  const [offset, setOffset] = useState(0);
  const list = useResource(
    `${root}/campaigns?limit=20&offset=${offset}`,
    parseCampaigns,
  );
  const [editing, setEditing] = useState<Campaign | null | undefined>();
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState<unknown>();
  const [saved, setSaved] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const allowed =
    !!event.data &&
    !!list.data &&
    !!types.data &&
    !event.error &&
    !list.error &&
    !types.error;
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  async function mutate(path: string, body: unknown, method: string) {
    if (lock.current || uncertain) return;
    lock.current = true;
    setPending(true);
    setError(undefined);
    setSaved(false);
    try {
      const result = parseCampaign(await request(path, { method, body }));
      if (result.event_id !== eventId) throw new Error("wrong_event");
      setEditing(undefined);
      setSaved(true);
      list.reload();
    } catch (e) {
      setError(e);
      if (!(
        e instanceof ApiError &&
        e.status >= 400 &&
        e.status < 500 &&
        e.status !== 408
      ))
        setUncertain(true);
    } finally {
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <section className="promotions">
      <BackLink to={`/organizer/events/${encodeURIComponent(eventId)}/edit`}>{t.back}</BackLink>
      <header>
        <h1>{t.title}</h1>
        {event.data && <p>{event.data.title}</p>}
        <p>{t.intro}</p>
      </header>
      {(event.error != null ||
        list.error != null ||
        types.error != null ||
        error != null) && (
        <div className="form-error" role="alert" tabIndex={-1} ref={ref}>
          <p>
            {error instanceof ApiError && error.code === "max_below_redemptions"
              ? t.limitConflict
              : error instanceof ApiError &&
                  [401, 403, 404].includes(error.status)
                ? t.denied
                : t.error}
          </p>
          {error instanceof ApiError && error.status >= 500 && error.requestId && (
            <p>{error.requestId}</p>
          )}
        </div>
      )}
      {uncertain && <p role="alert">{t.unknown}</p>}
      {saved && <p role="status">{t.saved}</p>}
      <div className="controls">
        <button
          className="secondary"
          disabled={pending}
          onClick={() => {
            event.reload();
            types.reload();
            list.reload();
            setUncertain(false);
            setError(undefined);
          }}
        >
          {t.refresh}
        </button>
        <button
          disabled={!allowed || pending || uncertain}
          onClick={() => {
            setEditing(null);
            setSaved(false);
          }}
        >
          {t.create}
        </button>
      </div>
      {!event.data && !event.error && <p role="status">{t.working}</p>}
      {allowed && editing !== undefined && (
        <CampaignForm
          key={editing?.id ?? "new"}
          initial={editing ?? undefined}
          zone={event.data!.timezone}
          locale={locale}
          types={types.data?.items ?? []}
          pending={pending || uncertain}
          close={() => setEditing(undefined)}
          save={(body) =>
            void mutate(
              editing
                ? `/api/v1/campaigns/${encodeURIComponent(editing.id)}`
                : `${root}/campaigns`,
              body,
              editing ? "PATCH" : "POST",
            )
          }
        />
      )}
      {allowed && (
        <>
          <div className="campaign-grid">
            {list.data!.items.map((c) => (
              <article className="campaign-card" key={c.id}>
                <h2>{c.name}</h2>
                <span className="status-badge">
                  {c.is_enabled ? t.enabled : t.disabled}
                </span>
                <p>
                  {t.code}: <strong className="promo-code">{c.code}</strong>
                </p>
                <p>
                  {c.discount_type === "percent"
                    ? `${c.discount_value}%`
                    : formatMoney(c.discount_value, locale)}
                </p>
                <p>
                  {formatEventDateTime(
                    c.valid_from,
                    event.data!.timezone,
                    locale,
                  )}{" "}
                  —{" "}
                  {formatEventDateTime(
                    c.valid_to,
                    event.data!.timezone,
                    locale,
                  )}
                </p>
                <p>
                  {t.used}: {c.redemptions_count} / {c.max_redemptions}
                </p>
                <p>
                  <Link
                    to={`/events/${encodeURIComponent(eventId)}?promo=${encodeURIComponent(c.code)}`}
                  >
                    {t.previewEvent}
                  </Link>
                </p>
                <div className="controls">
                  <button
                    className="secondary"
                    disabled={pending || uncertain}
                    onClick={() => setEditing(c)}
                  >
                    {t.edit}
                  </button>
                  <button
                    className="secondary"
                    disabled={pending || uncertain}
                    onClick={() =>
                      void mutate(
                        `/api/v1/campaigns/${encodeURIComponent(c.id)}`,
                        { is_enabled: !c.is_enabled },
                        "PATCH",
                      )
                    }
                  >
                    {c.is_enabled ? t.disable : t.enable}
                  </button>
                </div>
                <CampaignQr campaign={c} locale={locale} />
                <CampaignReport
                  key={`${c.id}:${c.redemptions_count}:${c.is_enabled}`}
                  campaign={c}
                  locale={locale}
                />
              </article>
            ))}
          </div>
          {!list.data!.items.length && editing === undefined && (
            <div className="empty-state" role="status">
              <p>{t.empty}</p>
            </div>
          )}
          {(offset > 0 || list.data!.total > 20) && (
          <nav className="controls" aria-label={t.title}>
            <button
              disabled={!offset || pending}
              onClick={() => setOffset((n) => Math.max(0, n - 20))}
            >
              {t.previous}
            </button>
            <span>
              {list.data!.total ? offset + 1 : 0}–
              {Math.min(offset + 20, list.data!.total)} / {list.data!.total}
            </span>
            <button
              disabled={offset + 20 >= list.data!.total || pending}
              onClick={() => setOffset((n) => n + 20)}
            >
              {t.next}
            </button>
          </nav>
          )}
        </>
      )}
    </section>
  );
}
function CampaignForm({
  initial,
  zone,
  types,
  locale,
  pending,
  save,
  close,
}: {
  initial?: Campaign;
  zone: string;
  types: { id: string; name: string }[];
  locale: Locale;
  pending: boolean;
  save: (body: unknown) => void;
  close: () => void;
}) {
  const t = promoCopy[locale];
  const [kind, setKind] = useState<"percent" | "fixed">(
    initial?.discount_type ?? "percent",
  );
  const [invalid, setInvalid] = useState(false);
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (invalid) errorRef.current?.focus();
  }, [invalid]);
  return (
    <form
      className="campaign-form"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (pending) return;
        setInvalid(false);
        try {
          const form = new FormData(e.currentTarget);
          if (initial) {
            form.set("discount_type", initial.discount_type);
            form.set(
              "discount_value",
              initial.discount_type === "percent"
                ? String(initial.discount_value)
                : priceInput(initial.discount_value),
            );
          }
          const body = campaignBody(form, zone);
          save(initial ? campaignPatch(body, form.has("is_enabled")) : body);
        } catch {
          setInvalid(true);
        }
      }}
    >
      <h2>{initial ? t.edit : t.create}</h2>
      {invalid && (
        <p role="alert" tabIndex={-1} ref={errorRef}>
          {t.invalid}
        </p>
      )}
      <fieldset disabled={pending}>
        <Field
          label={t.name}
          name="name"
          required
          maxLength={200}
          defaultValue={initial?.name}
        />
        <div className="promo-form-grid">
          <div className="field">
            <label htmlFor="discount-type">{t.kind}</label>
            <select
              id="discount-type"
              name="discount_type"
              disabled={!!initial}
              value={kind}
              onChange={(e) => setKind(e.target.value as "percent" | "fixed")}
            >
              <option value="percent">{t.percent}</option>
              <option value="fixed">{t.fixed}</option>
            </select>
          </div>
          <Field
            label={`${t.value} · ${kind === "percent" ? t.percent : "KZT"}`}
            name="discount_value"
            disabled={!!initial}
            inputMode="decimal"
            defaultValue={
              initial
                ? initial.discount_type === "percent"
                  ? initial.discount_value
                  : priceInput(initial.discount_value)
                : ""
            }
          />
          <Field
            label={t.from}
            name="valid_from"
            type="datetime-local"
            required
            defaultValue={initial ? zonedInput(initial.valid_from, zone) : ""}
          />
          <Field
            label={t.to}
            name="valid_to"
            type="datetime-local"
            required
            defaultValue={initial ? zonedInput(initial.valid_to, zone) : ""}
          />
          <Field
            label={t.limit}
            name="max_redemptions"
            type="number"
            min={1}
            max={1000000}
            required
            defaultValue={initial?.max_redemptions ?? 100}
          />
        </div>
        <p>{zone}</p>
        <fieldset disabled={!!initial}>
          <legend>{t.eligibility}</legend>
          <p className="field-hint">{t.allTypes}</p>
          {types.map((type) => (
            <label className="promo-check" key={type.id}>
              <input
                type="checkbox"
                name="ticket_type_ids"
                value={type.id}
                defaultChecked={initial?.ticket_type_ids.includes(type.id)}
              />
              {type.name}
            </label>
          ))}
        </fieldset>
        {initial && (
          <>
            <p>{t.immutable}</p>
            <label className="promo-check">
              <input
                name="is_enabled"
                type="checkbox"
                defaultChecked={initial.is_enabled}
              />
              {t.enabled}
            </label>
          </>
        )}
        <div className="controls">
          <button>{pending ? t.working : t.save}</button>
          <button className="secondary" type="button" onClick={close}>
            {t.cancel}
          </button>
        </div>
      </fieldset>
    </form>
  );
}
function CampaignQr({
  campaign,
  locale,
}: {
  campaign: Campaign;
  locale: Locale;
}) {
  const request = useEventRequest(),
    t = promoCopy[locale];
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    return () => {
      live.current = false;
    };
  }, []);
  async function download() {
    if (busy) return;
    setBusy(true);
    setError(false);
    try {
      const blob = validateBinary(
        await request<Blob>(
          `/api/v1/campaigns/${encodeURIComponent(campaign.id)}/qr`,
          { responseType: "blob", headers: { Accept: "image/png" } },
        ),
        "qr",
      );
      if (!live.current) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `campaign-${campaign.id}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (live.current) setError(true);
    } finally {
      if (live.current) setBusy(false);
    }
  }
  return (
    <div>
      <p>{t.qrHint}</p>
      <button
        className="secondary"
        disabled={busy}
        onClick={() => void download()}
      >
        {busy ? t.working : t.qr}
      </button>
      {error && <p role="alert">{t.downloadError}</p>}
    </div>
  );
}
function CampaignReport({
  campaign,
  locale,
}: {
  campaign: Campaign;
  locale: Locale;
}) {
  const [open, setOpen] = useState(false);
  const t = promoCopy[locale];
  const report = useResource(
    open ? `/api/v1/campaigns/${encodeURIComponent(campaign.id)}/report` : "",
    parseReport,
  );
  return (
    <div>
      <button
        className="secondary"
        onClick={() => setOpen((x) => !x)}
        aria-expanded={open}
      >
        {t.report}
      </button>
      {open && (
        <>
          <p>{t.reportHint}</p>
          {report.error != null ? (
            <p role="alert">
              {t.error}
              <button onClick={report.reload}>{t.refresh}</button>
            </p>
          ) : report.data ? (
            <dl>
              {[
                [t.used, report.data.redemptions],
                [t.orders, report.data.orders],
                [t.tickets, report.data.tickets_sold],
                [t.gross, formatMoney(report.data.gross_revenue, locale)],
                [t.discount, formatMoney(report.data.discount, locale)],
                [t.net, formatMoney(report.data.net_revenue, locale)],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p>{t.working}</p>
          )}
        </>
      )}
    </div>
  );
}
