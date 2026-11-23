import { ApiError } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "./copy";
import type { Locale } from "@biletflow/shared";

/**
 * A Kazakhstan phone in one format (+77012345678), or null. Mirrors the API's rule so the form
 * can explain the problem before sending: spaces, brackets, dashes and an 8/7 prefix are fine;
 * the number must be +7 6xx or +7 7xx (other +7 ranges are Russia).
 */
export function kazakhstanPhone(value: string): string | null {
  let digits = value.replace(/[\s().-]/g, "").replace(/^\+/, "");
  if (!/^\d+$/.test(digits)) return null;
  if (digits.length === 11 && (digits[0] === "7" || digits[0] === "8"))
    digits = digits.slice(1);
  return digits.length === 10 && /^[67]/.test(digits) ? `+7${digits}` : null;
}

/**
 * Accept only app-relative destinations. Never let email links or URL params redirect off-site.
 * With nothing (valid) asked for, sign-in opens the main page.
 */
const unsafeCharacter = (value: string) =>
  [...value].some((char) => char.charCodeAt(0) <= 32 || char === "\\");
export function safeReturnTo(value: string | null | undefined): string {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    unsafeCharacter(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://biletflow.invalid");
    const path = decodeURIComponent(url.pathname);
    if (
      url.origin !== "https://biletflow.invalid" ||
      unsafeCharacter(path) ||
      path.startsWith("//") ||
      /^\/(login|register|verify-email|forgot-password|reset-password)(\/|$)/i.test(
        path,
      )
    )
      return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

export function hasRole(
  user: components["schemas"]["UserOut"] | null,
  roles: readonly string[],
): boolean {
  return user !== null && roles.includes(user.role);
}

export function errorMessage(error: unknown, locale: Locale): string {
  const t = authCopy[locale];
  if (!(error instanceof ApiError)) return t.unknown;
  const byCode: Record<string, string> = {
    network_error: t.network,
    invalid_credentials: t.invalidCredentials,
    account_suspended: t.suspended,
    email_not_verified: t.needsVerification,
    email_taken: t.emailTaken,
    invalid_email_token: t.invalidLink,
    invalid_reset_token: t.invalidLink,
    validation_error: t.formError,
    request_not_replayed: t.writeRetry,
    organizer_not_found: t.profileMissing,
    invalid_refresh_token: t.expired,
    session_expired: t.expired,
    session_changed: t.expired,
  };
  return (
    byCode[error.code] ??
    (error.status === 429
      ? t.rateLimited
      : error.status === 403
        ? t.forbidden
        : error.status === 401
          ? t.expired
          : t.unknown)
  );
}

export function fieldErrors(
  error: unknown,
  allowed: readonly string[],
  locale: Locale,
): Record<string, string> {
  if (
    !(error instanceof ApiError) ||
    error.code !== "validation_error" ||
    !Array.isArray(error.details)
  )
    return {};
  const result: Record<string, string> = {};
  const t = authCopy[locale];
  const labels: Record<string, string> = {
    email: t.emailRequired,
    contact_email: t.emailRequired,
    full_name: t.nameRequired,
    organization_name: t.nameRequired,
    phone: t.phoneInvalid,
    contact_phone: t.phoneInvalid,
    password: t.passwordInvalid,
    new_password: t.passwordInvalid,
  };
  for (const item of error.details) {
    if (typeof item?.field !== "string") continue;
    const field = item.field.replace(/^body\./, "");
    if (allowed.includes(field)) result[field] = labels[field] ?? t.formError;
  }
  return result;
}

export const validEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
export const validName = (value: string) =>
  value.trim().length > 0 && value.trim().length <= 200;
export const validPassword = (value: string) =>
  value.length >= 8 && value.length <= 128;
