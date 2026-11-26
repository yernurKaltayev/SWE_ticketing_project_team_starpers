import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Status } from "../auth/ui";
import { useSession } from "../auth/session";
import { paymentCopy } from "./copy";
import {
  HALYK_TEST_CARD,
  decodeAppSession,
  parseHalykSession,
  parsePayment,
  parsePaymentConfig,
} from "./model";
import type { Payment } from "./model";
import { usePaymentQuery } from "./data";
import { DemoCardPayment } from "./DemoCardPayment";
import { PaymentError } from "./ui";
import "./payments.css";

/* Halyk ePay TEST environment checkout.
 *
 * 1. The order page starts the payment and opens /checkout/pay/:paymentId (our own route; the
 *    response's checkout URL is never followed).
 * 2. That page asks the API for a Halyk payment object (a short-lived token, never the client
 *    secret), loads Halyk's payform script and hands over with halyk.pay().
 * 3. Halyk sends the buyer back to /checkout/pay/:paymentId/return. The API confirms the payment
 *    with Halyk server to server; the browser never decides whether it succeeded.
 *
 * App mode (?app=1): the mobile app's in-app browser has no web session. The app fetches the
 * payment object itself and passes it in the URL fragment, which browsers never send to a server.
 * The return page then only hands back to the app, which confirms the payment with its own session. */

declare global {
  interface Window {
    halyk?: {
      pay?: (payment: unknown) => void;
      showPaymentWidget?: (
        payment: unknown,
        callback: (result: { success?: boolean }) => void,
      ) => void;
    };
  }
}

const paymentPath = (id: string) =>
  `/api/v1/payments/${encodeURIComponent(id)}`;

/** The order page's payment block: the demo card form (sandbox) or Halyk (test environment). */
export function OrderPayment({
  orderId,
  total,
  locale,
}: {
  orderId: string;
  total: number;
  locale: Locale;
}) {
  const config = usePaymentQuery("/api/v1/payments/config", parsePaymentConfig);
  if (config.isPending) return <Status>{paymentCopy[locale].loading}</Status>;
  // An older API without /payments/config only has the sandbox.
  if (config.data?.ticket_provider === "halyk")
    return <HalykStart orderId={orderId} total={total} locale={locale} />;
  return <DemoCardPayment orderId={orderId} total={total} locale={locale} />;
}

export function HalykTestCard({ locale }: { locale: Locale }) {
  const t = paymentCopy[locale];
  return (
    <dl className="halyk-test-card" aria-label={t.halykTestCard}>
      <div>
        <dt>{t.halykCardNumber}</dt>
        <dd translate="no">{HALYK_TEST_CARD.number}</dd>
      </div>
      <div>
        <dt>{t.halykCardExpiry}</dt>
        <dd translate="no">{HALYK_TEST_CARD.expiry}</dd>
      </div>
      <div>
        <dt>{t.halykCardCvc}</dt>
        <dd translate="no">{HALYK_TEST_CARD.cvc}</dd>
      </div>
    </dl>
  );
}

function HalykStart({
  orderId,
  total,
  locale,
}: {
  orderId: string;
  total: number;
  locale: Locale;
}) {
  const { controller } = useSession();
  const t = paymentCopy[locale];
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const flight = useRef(false);

  async function start() {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError(null);
    try {
      const started = parsePayment(
        await controller.request(
          `/api/v1/orders/${encodeURIComponent(orderId)}/payments`,
          { method: "POST" },
        ),
      );
      if (
        started.kind !== "ticket" ||
        started.amount !== total ||
        started.provider !== "halyk"
      )
        throw new ApiError(200, "invalid_response", "Unexpected payment.");
      navigate(`/checkout/pay/${encodeURIComponent(started.id)}`);
    } catch (e) {
      setError(e);
      setBusy(false);
    } finally {
      flight.current = false;
    }
  }

  return (
    <section className="payment-panel halyk-payment" aria-label={t.payment}>
      <h2>{t.halykTitle}</h2>
      <p className="notice">{t.halykNotice}</p>
      <HalykTestCard locale={locale} />
      <PaymentError error={error} locale={locale} />
      <div className="controls">
        <button type="button" disabled={busy} onClick={() => void start()}>
          {busy ? t.working : `${t.halykGo} · ${formatPrice(total, locale)}`}
        </button>
      </div>
    </section>
  );
}

function loadScript(src: string): Promise<void> {
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-halyk="${CSS.escape(src)}"]`,
  );
  if (existing && window.halyk) return Promise.resolve();
  existing?.remove();
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = true;
    script.dataset.halyk = src;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("halyk script failed"));
    document.head.appendChild(script);
  });
}

/** /checkout/pay/:paymentId: gets the Halyk payment object and opens Halyk's test form. */
export function HalykCheckout({ locale }: { locale: Locale }) {
  const { paymentId = "" } = useParams();
  const [params] = useSearchParams();
  const app = params.get("app") === "1";
  const { controller } = useSession();
  const navigate = useNavigate();
  const t = paymentCopy[locale];
  const [error, setError] = useState<unknown>(null);
  const [scriptFailed, setScriptFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current || !paymentId) return;
    started.current = true;
    void (async () => {
      try {
        const query = new URLSearchParams({ locale, client: "web" });
        const session = parseHalykSession(
          app
            ? decodeAppSession(window.location.hash)
            : await controller.request(
                `${paymentPath(paymentId)}/halyk-session?${query}`,
                { method: "POST" },
              ),
        );
        if (session.payment_id !== paymentId)
          throw new ApiError(200, "invalid_response", "Unexpected payment.");
        // Drop the token from the address bar and history once read.
        if (app) window.history.replaceState(null, "", window.location.pathname + window.location.search);
        try {
          await loadScript(session.script_url);
        } catch {
          setScriptFailed(true);
          return;
        }
        const halyk = window.halyk;
        if (halyk?.pay) halyk.pay(session.payment_object);
        else if (halyk?.showPaymentWidget)
          halyk.showPaymentWidget(session.payment_object, (result) => {
            const failed = result?.success ? "" : "failed=1";
            const suffix = [app ? "app=1" : "", failed].filter(Boolean).join("&");
            navigate(
              `/checkout/pay/${encodeURIComponent(paymentId)}/return${suffix ? `?${suffix}` : ""}`,
            );
          });
        else setScriptFailed(true);
      } catch (e) {
        setError(e);
      }
    })();
  }, [paymentId, app, controller, locale, navigate]);

  return (
    <main className="page halyk-checkout">
      <section className="payment-panel halyk-payment" aria-label={t.payment}>
        <h1>{t.halykTitle}</h1>
        <p className="notice">{t.halykNotice}</p>
        <HalykTestCard locale={locale} />
        {error ? (
          <>
            <PaymentError error={error} locale={locale} />
            <ReturnLinks paymentId={paymentId} locale={locale} />
          </>
        ) : scriptFailed ? (
          <p className="notice" role="alert">
            {t.halykScriptFailed}
          </p>
        ) : (
          <Status>{t.halykOpening}</Status>
        )}
      </section>
    </main>
  );
}

function ReturnLinks({
  paymentId,
  orderId,
  locale,
  app = false,
}: {
  paymentId: string;
  orderId?: string | null;
  locale: Locale;
  app?: boolean;
}) {
  const t = paymentCopy[locale];
  return (
    <div className="controls">
      {app ? (
        <a
          className="button"
          href={`biletflow://payments/${encodeURIComponent(paymentId)}`}
        >
          {t.backToApp}
        </a>
      ) : null}
      {orderId ? (
        <Link to={`/account/orders/${encodeURIComponent(orderId)}`}>
          {t.viewOrder}
        </Link>
      ) : (
        <Link to="/account/orders">{t.viewOrder}</Link>
      )}
    </div>
  );
}

const MAX_SYNCS = 10;

/** /checkout/pay/:paymentId/return: Halyk sent the buyer back. Ask the API to confirm. */
export function HalykReturn({ locale }: { locale: Locale }) {
  const { paymentId = "" } = useParams();
  const [params] = useSearchParams();
  const app = params.get("app") === "1";
  const { controller } = useSession();
  const client = useQueryClient();
  const t = paymentCopy[locale];
  const [payment, setPayment] = useState<Payment | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [syncs, setSyncs] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // In app mode there is no web session: the app confirms the payment itself.
    if (app || !paymentId || busy || syncs >= MAX_SYNCS) return;
    if (payment && payment.status !== "pending") return;
    const delay = syncs === 0 ? 0 : 3000;
    const timer = window.setTimeout(() => {
      setBusy(true);
      void controller
        .request(`${paymentPath(paymentId)}/sync`, { method: "POST" })
        .then((raw) => {
          setPayment(parsePayment(raw));
          setError(null);
        })
        .catch((e: unknown) => setError(e))
        .finally(() => {
          setSyncs((n) => n + 1);
          setBusy(false);
        });
    }, delay);
    return () => window.clearTimeout(timer);
  }, [app, paymentId, payment, syncs, busy, controller]);

  useEffect(() => {
    if (app)
      window.location.assign(
        `biletflow://payments/${encodeURIComponent(paymentId)}`,
      );
  }, [app, paymentId]);

  const settled = payment && payment.status !== "pending";
  useEffect(() => {
    if (!settled) return;
    void client.invalidateQueries({ queryKey: ["f3"] });
    void client.invalidateQueries({ queryKey: ["f4"] });
  }, [settled, client]);

  let message: string = app ? t.backToApp : t.halykConfirming;
  if (payment?.status === "succeeded") message = t.halykPaid;
  else if (payment && payment.status !== "pending") message = t.halykFailed;
  else if (syncs >= MAX_SYNCS) message = t.halykWaiting;

  return (
    <main className="page halyk-checkout">
      <section className="payment-panel halyk-payment" aria-label={t.payment}>
        <h1>{t.halykTitle}</h1>
        <p className="notice" role="status">
          {message}
        </p>
        {payment ? (
          <p>
            {t.amount} {formatPrice(payment.amount, locale, payment.currency)}
          </p>
        ) : null}
        <PaymentError error={error} locale={locale} />
        {syncs >= MAX_SYNCS && !settled ? (
          <div className="controls">
            <button type="button" onClick={() => setSyncs(0)}>
              {t.halykCheckAgain}
            </button>
          </div>
        ) : null}
        <ReturnLinks
          paymentId={paymentId}
          orderId={payment?.order_id}
          locale={locale}
          app={app}
        />
      </section>
    </main>
  );
}
