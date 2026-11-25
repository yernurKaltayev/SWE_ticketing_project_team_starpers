import { useState } from "react";
import { noFinalDot } from "../auth/helpers";
import { formatMoney } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { promoCopy, reasonText } from "./copy";
import type { usePromotion } from "./usePromotion";
import "./promotions.css";
export function PromoEntry({
  promotion,
  locale,
  disabled = false,
}: {
  promotion: ReturnType<typeof usePromotion>;
  locale: Locale;
  disabled?: boolean;
}) {
  const t = promoCopy[locale];
  const [draft, setDraft] = useState(promotion.code);
  // Most buyers have no code: keep the field folded until asked for, but open
  // whenever a code is already applied (e.g. from a campaign QR link).
  return (
    <details className="promo-toggle" open={!!promotion.code || undefined}>
      <summary>{t.have}</summary>
    <fieldset className="promo-entry" disabled={disabled}>
      <legend className="visually-hidden">{t.entry}</legend>
      <label htmlFor="promo-code">{t.entry}</label>
      <div className="controls">
        <input
          type="text"
          id="promo-code"
          name="promo-code"
          autoComplete="off"
          maxLength={64}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
        />
        <button
          type="button"
          className="secondary"
          onClick={() => {
            promotion.apply(draft);
            promotion.retry();
          }}
        >
          {t.apply}
        </button>
        {(promotion.code || promotion.status) && (
          <button
            className="secondary"
            type="button"
            onClick={() => {
              setDraft("");
              promotion.apply("");
            }}
          >
            {t.remove}
          </button>
        )}
      </div>
      {!promotion.code && promotion.status && (
        <p role="status">{reasonText(promotion.status, t)}</p>
      )}
      {promotion.code && (
        <>
          <p>
            {t.entry}: <strong>{promotion.code}</strong>
          </p>
          {!promotion.cart && <p>{t.select}</p>}
          {promotion.loading && <p role="status">{t.pending}</p>}
          {promotion.error && (
            <p role="alert">
              {t.validationError}{" "}
              <button type="button" onClick={promotion.retry}>
                {t.apply}
              </button>
            </p>
          )}
          {promotion.result && !promotion.result.valid && (
            <p role="alert">{reasonText(promotion.result.reason, t)}</p>
          )}
          {promotion.result?.valid && promotion.cart && (
            <div role="status">
              <p>
                {t.applied}: <strong>{promotion.code}</strong>
              </p>
              <p>
                {t.preview}:{" "}
                {formatMoney(promotion.result.discount_amount, locale)}
              </p>
              <p>
                {t.due}:{" "}
                {formatMoney(
                  promotion.cart.subtotal - promotion.result.discount_amount,
                  locale,
                )}
              </p>
              <p className="field-hint">{noFinalDot(t.previewHint)}</p>
            </div>
          )}
        </>
      )}
    </fieldset>
    </details>
  );
}
