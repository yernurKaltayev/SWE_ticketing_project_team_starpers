import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatMoney, formatEventDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field, Status } from "../auth/ui";
import {
  useCommerceQuery,
  eventPath,
  parseEvent,
  usePagination,
} from "../checkout/data";
import { paymentCopy } from "./copy";
import { usePaymentAction, usePaymentQuery } from "./data";
import {
  accountsPath,
  activationPath,
  normalizeIban,
  parseAccount,
  parseAccounts,
  parseActivation,
  parseFinancials,
  parsePayouts,
} from "./model";
import type { Account } from "./model";
import { PaymentPanel } from "./PaymentPanel";
import { PaymentError } from "./ui";
import "../checkout/checkout.css";
import "./payments.css";

export default function ActivationPage({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  return <ActivationContent key={eventId} eventId={eventId} locale={locale} />;
}
function ActivationContent({
  locale,
  eventId,
}: {
  locale: Locale;
  eventId: string;
}) {
  const t = paymentCopy[locale];
  const path = activationPath(eventId);
  const event = useCommerceQuery(eventPath(eventId), parseEvent);
  const activation = usePaymentQuery(path, parseActivation);
  const accounts = usePaymentQuery(accountsPath, parseAccounts);
  const action = usePaymentAction();
  const [selected, setSelected] = useState("");
  const [terms, setTerms] = useState(false);
  const data = activation.isError ? undefined : activation.data;
  const suspended = data?.status === "suspended";
  const busy = action.isPending || activation.isFetching;
  const steps = Object.entries(t.steps);
  function run(suffix: string, method = "POST", body?: unknown) {
    action.mutate({ path: path + suffix, method, body });
  }
  return (
    <section>
      <Link to="/organizer/events">{t.events}</Link>
      <h1>{t.activation}</h1>
      {event.data && (
        <p>
          <strong>{event.data.title}</strong>
        </p>
      )}
      <p className="notice">{t.demo}</p>
      <p>{t.eventOnly}</p>
      <nav className="controls">
        <Link to={`/organizer/events/${encodeURIComponent(eventId)}/edit`}>
          {t.viewEvent}
        </Link>
        <Link
          to={`/organizer/events/${encodeURIComponent(eventId)}/financials`}
        >
          {t.finances}
        </Link>
        <Link to="/organizer/payout-accounts">{t.accounts}</Link>
      </nav>
      <PaymentError
        error={
          activation.error ?? event.error ?? accounts.error ?? action.error
        }
        locale={locale}
      />
      {activation.isPending && <Status>{t.loading}</Status>}
      {data && (
        <>
          <Status>
            {data.status === "active"
              ? t.active
              : suspended
                ? t.suspended
                : t.incomplete}
          </Status>
          {data.missing_steps.some((s) => !(s in t.steps)) && (
            <p role="status">{t.unknownStep}</p>
          )}
          <ol className="activation-steps">
            {steps.map(([step, label]) => {
              const missing = data.missing_steps.includes(step);
              return (
                <li key={step}>
                  <div className="activation-step-heading">
                    <strong>{label}</strong>
                    <span>{missing ? t.missing : t.done}</span>
                  </div>
                  {missing && step === "paid_ticket_type" && (
                    <Link
                      to={`/organizer/events/${encodeURIComponent(eventId)}/edit`}
                    >
                      {t.viewEvent}
                    </Link>
                  )}
                  {missing && step === "identity_verification" && (
                    <button
                      disabled={busy || suspended}
                      onClick={() => run("/verify-identity")}
                    >
                      {t.verify}
                    </button>
                  )}
                  {step === "payout_account" && !suspended && (
                    <form
                      className="payment-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (selected)
                          run("", "PATCH", { payout_account_id: selected });
                      }}
                    >
                      <label className="field">
                        {t.select}
                        <select
                          value={selected || data.payout_account_id || ""}
                          required
                          disabled={busy}
                          onChange={(e) => setSelected(e.target.value)}
                        >
                          <option value="">{t.select}</option>
                          {!accounts.isError &&
                            accounts.data
                              ?.filter((a) => a.is_verified)
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.bank_name} · •••• {a.iban_last4} ·{" "}
                                  {t.verified}
                                </option>
                              ))}
                        </select>
                      </label>
                      <button disabled={busy || !selected}>{t.attach}</button>
                      {!accounts.isError && accounts.data?.length === 0 && (
                        <p>{t.emptyAccounts}</p>
                      )}
                    </form>
                  )}
                  {missing && step === "terms" && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (terms) run("", "PATCH", { accept_terms: true });
                      }}
                    >
                      <p>{t.termsNote}</p>
                      <label className="checkbox-field">
                        <input
                          type="checkbox"
                          checked={terms}
                          required
                          disabled={busy || suspended}
                          onChange={(e) => setTerms(e.target.checked)}
                        />
                        {t.terms}
                      </label>
                      <button disabled={!terms || busy || suspended}>
                        {t.accept}
                      </button>
                    </form>
                  )}
                  {missing && step === "activation_fee" && !suspended && (
                    <>
                      <p>{t.feeQuote}</p>
                      <PaymentPanel
                        locale={locale}
                        kind="activation_fee"
                        startPath={`${path}/pay`}
                      />
                    </>
                  )}
                </li>
              );
            })}
          </ol>
        </>
      )}
      <button
        className="secondary"
        disabled={activation.isFetching || action.isPending}
        onClick={() => {
          action.reset();
          void activation.refetch();
          void event.refetch();
          void accounts.refetch();
        }}
      >
        {t.refresh}
      </button>
    </section>
  );
}

export function AccountsPage({ locale }: { locale: Locale }) {
  const t = paymentCopy[locale];
  const query = usePaymentQuery(accountsPath, parseAccounts);
  const action = usePaymentAction();
  const [editing, setEditing] = useState<Account | null>(null);
  const [confirm, setConfirm] = useState("");
  return (
    <section>
      <Link to="/organizer/events">{t.events}</Link>
      <h1>{t.accounts}</h1>
      <p className="notice">{t.demo}</p>
      <Link to="/organizer/payouts">{t.payouts}</Link>
      <PaymentError error={query.error ?? action.error} locale={locale} />
      {query.isPending && <Status>{t.loading}</Status>}
      {query.data && !query.isError && (
        <>
          {!query.data.length && <Status>{t.emptyAccounts}</Status>}
          <ul className="payout-accounts">
            {query.data.map((a) => (
              <li key={a.id}>
                <strong>
                  {a.bank_name} · •••• {a.iban_last4}
                </strong>
                <p>{a.holder_name}</p>
                <p>{a.is_verified ? t.verified : t.unverified}</p>
                <div className="controls">
                  <button
                    className="secondary"
                    disabled={action.isPending}
                    onClick={() => {
                      setEditing(a);
                      setConfirm("");
                    }}
                  >
                    {t.edit}
                  </button>
                  <button
                    className="secondary"
                    disabled={action.isPending}
                    onClick={() => setConfirm(a.id)}
                  >
                    {t.remove}
                  </button>
                </div>
                {confirm === a.id && (
                  <div>
                    <p>{t.confirmRemove}</p>
                    <div className="controls">
                      <button
                        disabled={action.isPending}
                        onClick={() =>
                          action.mutate(
                            {
                              path: `${accountsPath}/${encodeURIComponent(a.id)}`,
                              method: "DELETE",
                            },
                            {
                              onSuccess: () => {
                                setConfirm("");
                                if (editing?.id === a.id) setEditing(null);
                              },
                            },
                          )
                        }
                      >
                        {t.confirm}
                      </button>
                      <button
                        className="secondary"
                        disabled={action.isPending}
                        onClick={() => setConfirm("")}
                      >
                        {t.cancel}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
      <AccountForm
        key={editing?.id ?? "new"}
        account={editing}
        locale={locale}
        cancel={() => setEditing(null)}
      />
      <button
        className="secondary"
        disabled={query.isFetching}
        onClick={() => {
          void query.refetch();
        }}
      >
        {t.refresh}
      </button>
    </section>
  );
}
function AccountForm({
  account,
  locale,
  cancel,
}: {
  account: Account | null;
  locale: Locale;
  cancel: () => void;
}) {
  const t = paymentCopy[locale];
  const action = usePaymentAction();
  const [error, setError] = useState<unknown>(null);
  const [saved, setSaved] = useState(false);
  const [ibanError, setIbanError] = useState(false);
  return (
    <form
      className="payment-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (action.isPending) return;
        const form = e.currentTarget;
        const values = new FormData(form);
        setError(null);
        setSaved(false);
        setIbanError(false);
        try {
          const body = {
            bank_name: String(values.get("bank_name")).trim(),
            holder_name: String(values.get("holder_name")).trim(),
            iban: normalizeIban(String(values.get("iban"))),
          };
          if (!body.bank_name || !body.holder_name) {
            form.reportValidity();
            return;
          }
          action.mutate(
            {
              path: account
                ? `${accountsPath}/${encodeURIComponent(account.id)}`
                : accountsPath,
              method: account ? "PATCH" : "POST",
              body,
            },
            {
              onSuccess: (raw) => {
                try {
                  parseAccount(raw);
                  form.reset();
                  setSaved(true);
                  if (account) cancel();
                } catch (caught) {
                  setError(caught);
                }
                action.reset(); // Do not retain the full IBAN in mutation variables after completion.
              },
              onError: (caught) => {
                setError(caught);
                action.reset();
              },
            },
          );
        } catch (caught) {
          setError(caught);
          setIbanError(true);
        }
      }}
    >
      <h2>{account ? t.edit : t.create}</h2>
      <PaymentError error={error} locale={locale} />
      {saved && <Status>{t.saved}</Status>}
      <fieldset disabled={action.isPending}>
        <Field
          name="bank_name"
          label={t.bank}
          required
          maxLength={200}
          defaultValue={account?.bank_name ?? ""}
        />
        <Field
          name="holder_name"
          label={t.holder}
          required
          maxLength={200}
          defaultValue={account?.holder_name ?? ""}
        />
        <Field
          name="iban"
          label={t.iban}
          required
          maxLength={42}
          autoComplete="off"
          spellCheck={false}
          hint={t.ibanHint}
          error={ibanError ? t.ibanError : undefined}
        />
        <div className="controls">
          <button>
            {action.isPending ? t.working : account ? t.save : t.create}
          </button>
          {account && (
            <button type="button" className="secondary" onClick={cancel}>
              {t.cancel}
            </button>
          )}
        </div>
      </fieldset>
    </form>
  );
}

export function FinancialsPage({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  const t = paymentCopy[locale];
  const event = useCommerceQuery(eventPath(eventId), parseEvent);
  const query = usePaymentQuery(
    `${eventPath(eventId)}/financials`,
    parseFinancials,
  );
  return (
    <section>
      <Link to="/organizer/events">{t.events}</Link>
      <h1>{t.finances}</h1>
      {event.data && <h2>{event.data.title}</h2>}
      <p className="notice">{t.demo}</p>
      <nav className="controls">
        <Link
          to={`/organizer/events/${encodeURIComponent(eventId)}/activation`}
        >
          {t.activation}
        </Link>
        <Link to="/organizer/payouts">{t.payouts}</Link>
        <Link to="/organizer/payout-accounts">{t.accounts}</Link>
      </nav>
      <PaymentError error={query.error ?? event.error} locale={locale} />
      {query.isPending && <Status>{t.loading}</Status>}
      {query.data && !query.isError && (
        <>
          <dl className="commerce-totals">
            {(
              [
                [t.gross, query.data.gross],
                [t.fees, query.data.fees],
                [t.refunds, query.data.refunds],
                [t.estimated, query.data.estimated_payout],
              ] as const
            ).map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{formatMoney(value, locale, query.data.currency)}</dd>
              </div>
            ))}
          </dl>
          <p>{t.noBuyerFee}</p>
        </>
      )}
      <button
        className="secondary"
        disabled={query.isFetching}
        onClick={() => {
          void query.refetch();
          void event.refetch();
        }}
      >
        {t.refresh}
      </button>
    </section>
  );
}
export function PayoutsPage({ locale }: { locale: Locale }) {
  const t = paymentCopy[locale];
  const pagination = usePagination();
  const query = usePaymentQuery(
    `/api/v1/organizers/me/payouts?limit=20&offset=${pagination.offset}`,
    parsePayouts,
  );
  return (
    <section>
      <Link to="/organizer/events">{t.events}</Link>
      <h1>{t.payouts}</h1>
      <p className="notice">{t.demo}</p>
      <Link to="/organizer/payout-accounts">{t.accounts}</Link>
      <PaymentError error={query.error} locale={locale} />
      {query.isPending && <Status>{t.loading}</Status>}
      {query.data && !query.isError && (
        <>
          {!query.data.items.length ? (
            <Status>{t.emptyPayouts}</Status>
          ) : (
            <div className="table-scroll">
              <table className="payout-history">
                <caption>{t.payouts}</caption>
                <thead>
                  <tr>
                    {[
                      t.event,
                      t.gross,
                      t.fees,
                      t.refunds,
                      t.net,
                      t.status,
                      t.date,
                    ].map((label) => (
                      <th scope="col" key={label}>
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {query.data.items.map((p) => (
                    <tr key={p.id}>
                      <td>
                        <Link
                          to={`/organizer/events/${encodeURIComponent(p.event_id)}/financials`}
                        >
                          {p.event_id}
                        </Link>
                      </td>
                      {[p.gross, p.fees, p.refunds, p.net].map((value, i) => (
                        <td key={i}>
                          {formatMoney(value, locale, p.currency)}
                        </td>
                      ))}
                      <td>
                        {p.status === "scheduled"
                          ? t.scheduled
                          : p.status === "paid"
                            ? t.paid
                            : p.status === "failed"
                              ? t.failed
                              : p.status === "pending"
                                ? t.pending
                                : t.status}
                      </td>
                      <td>
                        {p.paid_at || p.scheduled_for
                          ? formatEventDateTime(
                              (p.paid_at || p.scheduled_for)!,
                              "Asia/Almaty",
                              locale,
                            )
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <nav className="controls" aria-label={t.payouts}>
            <button
              disabled={!pagination.offset}
              onClick={() => pagination.change(pagination.offset - 20)}
            >
              {t.previous}
            </button>
            <button
              disabled={pagination.offset + 20 >= query.data.total}
              onClick={() => pagination.change(pagination.offset + 20)}
            >
              {t.next}
            </button>
          </nav>
        </>
      )}
      <button
        className="secondary"
        disabled={query.isFetching}
        onClick={() => {
          void query.refetch();
        }}
      >
        {t.refresh}
      </button>
    </section>
  );
}
