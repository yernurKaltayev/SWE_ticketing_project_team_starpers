import { useEffect, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError, formatPrice } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { Field } from "../auth/ui";
import { useSession } from "../auth/session";
import { paymentCopy } from "./copy";
import { parsePayment } from "./model";
import { PaymentError } from "./ui";
import { DEMO_CARD, cardErrors } from "./demoCard";
import type { Card } from "./demoCard";
import "./payments.css";

/** Demo checkout for a pending paid order: a fake card form and one Pay button.
 *
 * Pay starts (or resumes) the order's sandbox payment, then asks the sandbox to report success.
 * The backend confirms the order through its signed webhook path and issues the buyer's tickets.
 * No card data is sent: requests carry only the order/payment IDs and `{outcome: "succeeded"}`. */
export function DemoCardPayment({
  orderId,
  total,
  locale,
}: {
  orderId: string;
  total: number;
  locale: Locale;
}) {
  const { user, controller } = useSession();
  const t = paymentCopy[locale];
  const client = useQueryClient();
  const [card, setCard] = useState<Card>(() => ({
    ...DEMO_CARD,
    holder: user?.full_name ?? "",
  }));
  const [invalid, setInvalid] = useState<(keyof Card)[]>([]);
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

  async function pay() {
    if (flight.current) return;
    const bad = cardErrors(card);
    setInvalid(bad);
    if (bad.length) return;
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
      if (started.kind !== "ticket" || started.amount !== total)
        throw new ApiError(200, "invalid_response", "Unexpected payment.");
      if (started.status === "pending")
        parsePayment(
          await controller.request(
            `/api/v1/payments/${encodeURIComponent(started.id)}/simulate`,
            { method: "POST", body: { outcome: "succeeded" } },
          ),
        );
    } catch (e) {
      if (mounted.current) setError(e);
    } finally {
      flight.current = false;
      if (mounted.current) setBusy(false);
      // The order page refetches and shows the paid order with its tickets.
      void client.invalidateQueries({ queryKey: ["f3"] });
    }
  }

  const set = (key: keyof Card) => (e: ChangeEvent<HTMLInputElement>) =>
    setCard((old) => ({ ...old, [key]: e.target.value }));
  const err = (key: keyof Card) =>
    invalid.includes(key) ? t.cardInvalid : undefined;

  return (
    <section className="payment-panel demo-card" aria-label={t.payment}>
      <h2>{t.payment}</h2>
      <p className="notice">{t.demoCard}</p>
      <PaymentError error={error} locale={locale} />
      <form
        className="demo-card-form"
        noValidate
        autoComplete="off"
        onSubmit={(e) => {
          e.preventDefault();
          void pay();
        }}
      >
        <Field
          id="demo-card-number"
          label={t.cardNumber}
          inputMode="numeric"
          autoComplete="off"
          value={card.number}
          onChange={set("number")}
          error={err("number")}
        />
        <div className="demo-card-row">
          <Field
            id="demo-card-expiry"
            label={t.cardExpiry}
            inputMode="numeric"
            autoComplete="off"
            value={card.expiry}
            onChange={set("expiry")}
            error={err("expiry")}
          />
          <Field
            id="demo-card-cvc"
            label={t.cardCvc}
            inputMode="numeric"
            autoComplete="off"
            value={card.cvc}
            onChange={set("cvc")}
            error={err("cvc")}
          />
        </div>
        <Field
          id="demo-card-holder"
          label={t.cardHolder}
          autoComplete="off"
          value={card.holder}
          onChange={set("holder")}
          error={err("holder")}
        />
        <div className="controls">
          <button type="submit" disabled={busy}>
            {busy ? t.working : `${t.payNow} ${formatPrice(total, locale)}`}
          </button>
        </div>
      </form>
    </section>
  );
}
