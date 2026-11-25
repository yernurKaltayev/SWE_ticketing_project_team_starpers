import { useEffect, useRef } from "react";
import type { ComponentProps, ReactNode } from "react";
import { ApiError } from "@biletflow/shared";
import { AlertIcon } from "../icons";
import type { Locale } from "@biletflow/shared";
import { authCopy } from "./copy";
import { errorMessage, noFinalDot } from "./helpers";

export function Field({
  label,
  error,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name!;
  const input = (
      <input
        {...props}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={
          [hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
  );
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {input}
      {hint && !error ? (
        <p className="field-hint" id={`${id}-hint`}>
          {noFinalDot(hint)}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {noFinalDot(error)}
        </p>
      ) : null}
    </div>
  );
}

const noFields: Record<string, string> = {};
export function FormError({
  error,
  fields = noFields,
  locale,
}: {
  error: unknown;
  fields?: Record<string, string>;
  locale: Locale;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Field problems are shown under each field; jump to the first one on
    // screen instead of repeating them all in a summary box.
    if (error) return ref.current?.focus();
    const first = Object.keys(fields)
      .map((id) => document.getElementById(id))
      .filter((el): el is HTMLElement => el !== null)
      .sort((a, b) =>
        a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1,
      )[0];
    first?.focus();
  }, [error, fields]);
  if (!error) return null;
  const t = authCopy[locale];
  return (
    <div className="form-error" role="alert" tabIndex={-1} ref={ref}>
      <AlertIcon size={20} />
      <div>
      <p>{errorMessage(error, locale)}</p>
      {error instanceof ApiError && error.status >= 500 && error.requestId ? (
        <p className="field-hint">
          {t.requestId}: {error.requestId}
        </p>
      ) : null}
      {error instanceof ApiError && error.retryAfter ? (
        <p className="field-hint">
          {t.retryAfter}: {error.retryAfter}
        </p>
      ) : null}
      </div>
    </div>
  );
}

export function Status({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="status">
      {children}
    </p>
  );
}

