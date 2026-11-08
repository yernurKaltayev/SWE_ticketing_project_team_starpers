import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { useSession } from "../auth/session";
import { paymentCopy } from "./copy";
import { parsePayment } from "./model";
import type { Payment } from "./model";
import { usePaymentQuery } from "./data";
import { PaymentError } from "./ui";
import "./payments.css";

/** Only opaque, account-scoped payment IDs are saved. Every outcome is read from P6.
 * No response-supplied checkout URL is followed; scenario controls use the authenticated API. */
export function PaymentPanel({
  locale,
  startPath,
  kind,
  amount,
}: {
  locale: Locale;
  startPath: string;
  kind: Payment["kind"];
  amount?: number;
}) {
  const { user, controller } = useSession();
  const t = paymentCopy[locale];
  const client = useQueryClient();
  const storageKey = `biletflow:f4:${user?.id}:${startPath}`;
  const [paymentId, setPaymentId] = useState(() => {
    try {
      return localStorage.getItem(storageKey) ?? "";
    } catch {
      return "";
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const flight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const query = usePaymentQuery(
    paymentId ? `/api/v1/payments/${encodeURIComponent(paymentId)}` : "",
    parsePayment,
    !!paymentId,
  );
  const payment =
    !query.isError &&
    query.data?.kind === kind &&
    (amount === undefined || query.data.amount === amount)
      ? query.data
      : undefined;
  const [polls, setPolls] = useState(0);
  const confirmedId = payment?.id;
  const confirmedStatus = payment?.status;
  const { refetch, dataUpdatedAt, isFetching } = query;
  useEffect(() => {
    if (payment?.status !== "pending" || polls >= 10 || isFetching) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState !== "hidden") {
        setPolls((n) => n + 1);
        void refetch();
      }
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [payment?.status, polls, isFetching, dataUpdatedAt, refetch]);
  useEffect(() => {
    if (!confirmedId || confirmedStatus === "pending") return;
    void client.invalidateQueries({ queryKey: ["f3"] });
    // Refetch activation/financials without re-fetching this payment in a loop.
    void client.invalidateQueries({
      queryKey: ["f4"],
      predicate: (q) => !String(q.queryKey[2]).includes("/payments/"),
    });
  }, [confirmedId, confirmedStatus, client]);

  async function act(outcome?: "succeeded" | "failed") {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      const raw = await controller.request(
        outcome
          ? `/api/v1/payments/${encodeURIComponent(paymentId)}/simulate`
          : startPath,
        {
          method: "POST",
          ...(outcome ? { body: { outcome } } : {}),
        },
      );
      const result = parsePayment(raw);
      if (
        result.kind !== kind ||
        (amount !== undefined && result.amount !== amount)
      )
        throw new ApiError(200, "invalid_response", "Unexpected payment.");
      if (!mounted.current) return;
      setPaymentId(result.id);
      setPolls(0);
      try {
        localStorage.setItem(storageKey, result.id);
      } catch {
        /* Explicit start resumes the backend's pending intent if storage is unavailable. */
      }
      client.setQueryData(
        ["f4", user?.id, `/api/v1/payments/${encodeURIComponent(result.id)}`],
        result,
      );
    } catch (e) {
      if (mounted.current) {
        setError(e);
        if (paymentId) await refetch();
      }
    } finally {
      flight.current = false;
      if (mounted.current) {
        setBusy(false);
        void client.invalidateQueries({ queryKey: ["f3"] });
        void client.invalidateQueries({
          queryKey: ["f4"],
          predicate: (q) => !String(q.queryKey[2]).includes("/payments/"),
        });
      }
    }
  }
  return (
    <section className="payment-panel" aria-label={t.payment}>
      <h2>{t.payment}</h2>
      <p className="notice">{t.demo}</p>
      <PaymentError
        error={
          error ??
          query.error ??
          (query.data && !payment ? new Error("invalid payment") : null)
        }
        locale={locale}
      />
      {!!error && <p role="status">{t.checkFirst}</p>}
      {!paymentId && (
        <button
          disabled={busy}
          onClick={() => {
            void act();
          }}
        >
          {busy ? t.working : kind === "ticket" ? t.startPayment : t.startFee}
        </button>
      )}
      {paymentId && query.isPending && <Status>{t.loading}</Status>}
      {payment && (
        <>
          <dl className="commerce-totals">
            <div>
              <dt>{t.amount}</dt>
              <dd>{formatMoney(payment.amount, locale, payment.currency)}</dd>
            </div>
            {kind === "ticket" && (
              <div>
                <dt>{t.deduction}</dt>
                <dd>
                  {formatMoney(payment.fee_amount, locale, payment.currency)}
                </dd>
              </div>
            )}
          </dl>
          {kind === "ticket" && <p>{t.noBuyerFee}</p>}
          <Status>
            {kind === "activation_fee" && payment.status === "pending"
              ? t.activationPending
              : t[
                  payment.status as
                    "pending" | "succeeded" | "failed" | "cancelled"
                ]}
          </Status>
          {payment.status === "pending" && payment.is_simulated && (
            <div className="controls">
              <button
                disabled={busy || query.isFetching}
                onClick={() => {
                  void act("succeeded");
                }}
              >
                {busy ? t.working : t.succeed}
              </button>
              <button
                className="secondary"
                disabled={busy || query.isFetching}
                onClick={() => {
                  void act("failed");
                }}
              >
                {t.fail}
              </button>
            </div>
          )}
          {kind === "activation_fee" &&
            ["failed", "cancelled"].includes(payment.status) && (
              <button
                disabled={busy}
                onClick={() => {
                  void act();
                }}
              >
                {t.retryPayment}
              </button>
            )}
          {payment.status === "pending" && polls >= 10 && <p>{t.pollEnded}</p>}
        </>
      )}
      {paymentId && (
        <div className="controls">
          <button
            className="secondary"
            disabled={busy || query.isFetching}
            onClick={() => {
              setError(null);
              setPolls(0);
              void refetch();
            }}
          >
            {t.refresh}
          </button>
          {!payment && !query.isPending && (
            <button
              disabled={busy}
              onClick={() => {
                void act();
              }}
            >
              {t.resume}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
