import { useEffect, useRef } from "react";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { paymentCopy } from "./copy";
export function PaymentError({
  error,
  locale,
}: {
  error: unknown;
  locale: Locale;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const t = paymentCopy[locale];
  useEffect(() => {
    if (error) ref.current?.focus();
  }, [error]);
  if (!error) return null;
  let message = t.error;
  if (error instanceof ApiError) {
    if ([403, 404].includes(error.status)) message = t.unavailable;
    if (error.status === 422)
      message = error.code === "invalid_iban" ? t.ibanError : t.invalid;
    if (error.code === "payout_account_in_use") message = t.linked;
    if (error.code === "paid_sales_inactive") message = t.blocked;
  }
  return (
    <div className="form-error" ref={ref} tabIndex={-1} role="alert">
      <p>{message}</p>
    </div>
  );
}
