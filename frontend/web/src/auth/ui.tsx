import { useEffect, useRef, useState } from "react";
import { EyeIcon } from "../icons";
import type { ComponentProps, ReactNode } from "react";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { authCopy } from "./copy";
import { errorMessage } from "./helpers";

export function Field({
  label,
  error,
  hint,
  ...props
}: ComponentProps<"input"> & { label: string; error?: string; hint?: string }) {
  const id = props.id ?? props.name!;
  const secret = props.type === "password";
  const [shown, setShown] = useState(false);
  const input = (
      <input
        {...props}
        type={secret && shown ? "text" : props.type}
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
      {secret ? (
        <div className="password-input">
          {input}
          <button
            type="button"
            className="password-toggle"
            aria-controls={id}
            aria-pressed={shown}
            aria-label={revealLabel()}
            onClick={() => setShown((v) => !v)}
          >
            <EyeIcon />
          </button>
        </div>
      ) : (
        input
      )}
      {hint ? (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
      {error ? (
        <p className="field-error" id={`${id}-error`}>
          {error}
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
  const hasFields = Object.keys(fields).length > 0;
  useEffect(() => {
    if (error || hasFields) ref.current?.focus();
  }, [error, hasFields, fields]);
  if (!error && !hasFields) return null;
  const t = authCopy[locale];
  return (
    <div className="form-error" role="alert" tabIndex={-1} ref={ref}>
      <p>{error ? errorMessage(error, locale) : t.formError}</p>
      {hasFields ? (
        <ul>
          {Object.entries(fields).map(([field, message]) => (
            <li key={field}>
              <a href={`#${field}`}>{message}</a>
            </li>
          ))}
        </ul>
      ) : null}
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
  );
}

export function Status({ children }: { children: ReactNode }) {
  return (
    <p className="notice" role="status">
      {children}
    </p>
  );
}

/** Field has no locale prop; the document language is kept in sync by App. */
function revealLabel() {
  const lang =
    typeof document === "undefined" ? "en" : document.documentElement.lang;
  return lang === "ru"
    ? "Показать пароль"
    : lang === "kk"
      ? "Құпия сөзді көрсету"
      : "Show password";
}
