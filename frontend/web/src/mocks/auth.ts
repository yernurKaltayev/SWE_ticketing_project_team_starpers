import { http, HttpResponse } from "msw";
import type { components } from "@biletflow/shared/api";

type User = components["schemas"]["UserOut"];
type Organizer = components["schemas"]["OrganizerProfileOut"];
interface Account {
  user: User;
  password: string;
  suspended: boolean;
  organizer?: Organizer;
}
interface RefreshCredential {
  email: string;
  spent: boolean;
}

/** Development fixtures only. The browser entry point imports these through MSW. */
export const mockPassword = "BiletFlow123!";
const headers = { "X-Request-ID": "f1-mock-request" };
const accounts = new Map<string, Account>();
const accessTokens = new Map<string, string>();
const refreshTokens = new Map<string, RefreshCredential>();
const verificationTokens = new Map<string, string>();
const resetTokens = new Map<string, string>();

function account(
  email: string,
  role: string,
  verified = true,
  suspended = false,
): Account {
  const user: User = {
    id: crypto.randomUUID(),
    email,
    full_name: `Demo ${role}`,
    phone: null,
    role,
    email_verified_at: verified ? "2026-01-01T00:00:00Z" : null,
  };
  return {
    user,
    password: mockPassword,
    suspended,
    ...(role === "organizer"
      ? {
          organizer: {
            id: crypto.randomUUID(),
            organization_name: user.full_name,
            contact_email: email,
            contact_phone: "",
            verification_status: "unverified",
            terms_accepted_at: null,
          },
        }
      : {}),
  };
}

export function resetAuthMocks() {
  accounts.clear();
  accessTokens.clear();
  refreshTokens.clear();
  verificationTokens.clear();
  resetTokens.clear();
  for (const entry of [
    account("organizer@example.com", "organizer"),
    account("attendee@example.com", "attendee"),
    account("admin@example.com", "platform_admin"),
    account("unverified@example.com", "attendee", false),
    account("suspended@example.com", "attendee", true, true),
  ])
    accounts.set(entry.user.email, entry);
  verificationTokens.set("mock-verify-unverified", "unverified@example.com");
  resetTokens.set("mock-reset-organizer", "organizer@example.com");
}
resetAuthMocks();

/** Simulates access expiry while preserving refresh sessions for recovery checks. */
export function expireMockAccessTokens() {
  accessTokens.clear();
}

function error(status: number, code: string, details: unknown = null) {
  return HttpResponse.json(
    { code, message: "Development fixture response.", details },
    {
      status,
      headers: status === 429 ? { ...headers, "Retry-After": "60" } : headers,
    },
  );
}
function invalid(field: string) {
  return error(422, "validation_error", [
    {
      field: `body.${field}`,
      message: "The field is invalid.",
      type: "value_error",
    },
  ]);
}
function message(value: string) {
  return HttpResponse.json({ message: value }, { headers });
}
function tokens(email: string) {
  const access_token = `mock-access-${crypto.randomUUID()}`;
  const refresh_token = `mock-refresh-${crypto.randomUUID()}`;
  accessTokens.set(access_token, email);
  refreshTokens.set(refresh_token, { email, spent: false });
  return HttpResponse.json(
    { access_token, refresh_token, token_type: "bearer" },
    { headers },
  );
}
function revokeRefresh(email: string) {
  for (const credential of refreshTokens.values()) {
    if (credential.email === email.toLowerCase()) credential.spent = true;
  }
}
function current(request: Request): Account | Response {
  const authorization = request.headers.get("Authorization");
  if (!authorization) return error(401, "unauthorized");
  const email = accessTokens.get(authorization.replace(/^Bearer /, ""));
  const entry = email ? accounts.get(email) : undefined;
  if (!entry) return error(401, "invalid_token");
  if (entry.suspended) return error(403, "account_suspended");
  return entry;
}
async function body(request: Request): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await request.json();
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}
function validEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
function validName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= 200
  );
}
function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}
function issueEmailToken(
  target: Map<string, string>,
  purpose: "verify" | "reset",
  email: string,
) {
  for (const [token, owner] of target)
    if (owner === email.toLowerCase()) target.delete(token);
  target.set(
    `mock-${purpose}-${encodeURIComponent(email)}`,
    email.toLowerCase(),
  );
}

export const authHandlers = [
  http.post("*/api/v1/auth/register", async ({ request }) => {
    const data = await body(request);
    if (!validEmail(data.email)) return invalid("email");
    if (!validPassword(data.password)) return invalid("password");
    if (!validName(data.full_name)) return invalid("full_name");
    if (data.role !== "attendee" && data.role !== "organizer")
      return invalid("role");
    if (data.email === "rate-limited@example.com")
      return error(429, "too_many_requests");
    if (accounts.has(data.email.toLowerCase()))
      return error(409, "email_taken");
    const entry = account(data.email, data.role, false);
    entry.user.full_name = data.full_name.trim();
    entry.password = data.password;
    if (entry.organizer)
      entry.organizer.organization_name = data.full_name.trim();
    accounts.set(data.email.toLowerCase(), entry);
    issueEmailToken(verificationTokens, "verify", data.email);
    return HttpResponse.json(entry.user, { status: 201, headers });
  }),
  http.post("*/api/v1/auth/login", async ({ request }) => {
    const data = await body(request);
    if (!validEmail(data.email)) return invalid("email");
    if (typeof data.password !== "string" || data.password.length > 128)
      return invalid("password");
    if (data.email === "rate-limited@example.com")
      return error(429, "too_many_requests");
    if (data.email === "network@example.com") return HttpResponse.error();
    const entry = accounts.get(data.email.toLowerCase());
    if (!entry || entry.password !== data.password)
      return error(401, "invalid_credentials");
    if (entry.suspended) return error(403, "account_suspended");
    if (!entry.user.email_verified_at) return error(403, "email_not_verified");
    return tokens(data.email.toLowerCase());
  }),
  http.post("*/api/v1/auth/verify-email", async ({ request }) => {
    const data = await body(request);
    const token = typeof data.token === "string" ? data.token : "";
    const email = verificationTokens.get(token);
    const entry = email ? accounts.get(email) : undefined;
    if (!entry) return error(422, "invalid_email_token");
    entry.user.email_verified_at = new Date().toISOString();
    verificationTokens.delete(token);
    return message("Your email is confirmed.");
  }),
  http.post("*/api/v1/auth/resend-verification", async ({ request }) => {
    const data = await body(request);
    if (!validEmail(data.email)) return invalid("email");
    if (data.email === "rate-limited@example.com")
      return error(429, "too_many_requests");
    const entry = accounts.get(data.email.toLowerCase());
    if (entry && !entry.user.email_verified_at)
      issueEmailToken(verificationTokens, "verify", data.email);
    return message(
      "If this address needs confirming, a new link is on its way.",
    );
  }),
  http.post("*/api/v1/auth/refresh", async ({ request }) => {
    const data = await body(request);
    const credential = refreshTokens.get(
      typeof data.refresh_token === "string" ? data.refresh_token : "",
    );
    if (!credential) return error(401, "invalid_refresh_token");
    if (credential.spent) {
      revokeRefresh(credential.email);
      return error(401, "invalid_refresh_token");
    }
    const entry = accounts.get(credential.email);
    if (!entry) return error(401, "invalid_refresh_token");
    if (entry.suspended) return error(403, "account_suspended");
    credential.spent = true;
    return tokens(credential.email);
  }),
  http.post("*/api/v1/auth/logout", async ({ request }) => {
    const entry = current(request);
    if (entry instanceof Response) return entry;
    const data = await body(request);
    const credential = refreshTokens.get(
      typeof data.refresh_token === "string" ? data.refresh_token : "",
    );
    if (credential && credential.email === entry.user.email.toLowerCase())
      credential.spent = true;
    return new HttpResponse(null, { status: 204, headers });
  }),
  http.post("*/api/v1/auth/forgot-password", async ({ request }) => {
    const data = await body(request);
    if (!validEmail(data.email)) return invalid("email");
    if (data.email === "rate-limited@example.com")
      return error(429, "too_many_requests");
    if (accounts.has(data.email.toLowerCase()))
      issueEmailToken(resetTokens, "reset", data.email);
    return message(
      "If an account exists for this address, a reset link is on its way.",
    );
  }),
  http.post("*/api/v1/auth/reset-password", async ({ request }) => {
    const data = await body(request);
    if (!validPassword(data.new_password)) return invalid("new_password");
    const token = typeof data.token === "string" ? data.token : "";
    const email = resetTokens.get(token);
    const entry = email ? accounts.get(email) : undefined;
    if (!entry) return error(422, "invalid_email_token");
    entry.password = data.new_password;
    resetTokens.delete(token);
    revokeRefresh(entry.user.email);
    return message("Your password has been changed. Sign in with the new one.");
  }),
  http.get("*/api/v1/me", ({ request }) => {
    const entry = current(request);
    return entry instanceof Response
      ? entry
      : HttpResponse.json(entry.user, { headers });
  }),
  http.patch("*/api/v1/me", async ({ request }) => {
    const entry = current(request);
    if (entry instanceof Response) return entry;
    const data = await body(request);
    if ("full_name" in data) {
      if (!validName(data.full_name)) return invalid("full_name");
      entry.user.full_name = data.full_name.trim();
    }
    if ("phone" in data) {
      if (
        data.phone !== null &&
        (typeof data.phone !== "string" || data.phone.trim().length > 32)
      )
        return invalid("phone");
      entry.user.phone =
        typeof data.phone === "string" ? data.phone.trim() : null;
    }
    return HttpResponse.json(entry.user, { headers });
  }),
  http.get("*/api/v1/organizers/me", ({ request }) => {
    const entry = current(request);
    if (entry instanceof Response) return entry;
    if (entry.user.role !== "organizer") return error(403, "insufficient_role");
    return entry.organizer
      ? HttpResponse.json(entry.organizer, { headers })
      : error(404, "organizer_not_found");
  }),
  http.patch("*/api/v1/organizers/me", async ({ request }) => {
    const entry = current(request);
    if (entry instanceof Response) return entry;
    if (entry.user.role !== "organizer") return error(403, "insufficient_role");
    if (!entry.organizer) return error(404, "organizer_not_found");
    const data = await body(request);
    if ("organization_name" in data) {
      if (!validName(data.organization_name))
        return invalid("organization_name");
      entry.organizer.organization_name = data.organization_name.trim();
    }
    if ("contact_email" in data) {
      if (!validEmail(data.contact_email)) return invalid("contact_email");
      entry.organizer.contact_email = data.contact_email;
    }
    if ("contact_phone" in data) {
      if (
        typeof data.contact_phone !== "string" ||
        data.contact_phone.trim().length > 32
      )
        return invalid("contact_phone");
      entry.organizer.contact_phone = data.contact_phone.trim();
    }
    return HttpResponse.json(entry.organizer, { headers });
  }),
];

/** Shared identity boundary for feature development fixtures. */
export function mockCurrentUser(request: Request): User | Response {
  const result = current(request);
  return result instanceof Response ? result : result.user;
}
