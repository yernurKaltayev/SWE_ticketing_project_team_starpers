import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { api } from "../api";
import { authCopy } from "./copy";
import {
  fieldErrors,
  safeReturnTo,
  validEmail,
  validName,
  validPassword,
} from "./helpers";
import { useSession } from "./session";
import { Field, FormError, Status } from "./ui";

export type AuthKind =
  "login" | "register" | "verify-email" | "forgot-password" | "reset-password";
export function AuthPage({ kind, locale }: { kind: AuthKind; locale: Locale }) {
  const t = authCopy[locale];
  const [params, setParams] = useSearchParams();
  const returnTo = safeReturnTo(params.get("returnTo"));
  const suffix = `?returnTo=${encodeURIComponent(returnTo)}`;
  const [token, setToken] = useState(() => params.get("token") ?? "");
  const [values, setValues] = useState({
    email: "",
    password: "",
    full_name: "",
    confirm: "",
    role: "attendee",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState("");
  const [busy, setBusy] = useState(false);
  const { controller, reason, user } = useSession();
  const navigate = useNavigate();
  const active = useRef(true);
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      pending.current?.abort();
    };
  }, []);
  // Consume a link only on explicit submission; keep its secret out of later browser URLs/referrers.
  useEffect(() => {
    if (params.has("token")) {
      const next = new URLSearchParams(params);
      next.delete("token");
      setParams(next, { replace: true });
    }
  }, [params, setParams]);
  const titles = {
    login: t.login,
    register: t.register,
    "verify-email": t.verifyTitle,
    "forgot-password": t.forgotTitle,
    "reset-password": t.resetTitle,
  };
  const change = (name: keyof typeof values, value: string) =>
    setValues((previous) => ({ ...previous, [name]: value }));

  async function submit(event: FormEvent<HTMLFormElement>, action = kind) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    const email = values.email.trim();
    const hasEmail =
      action !== "reset-password" && !(action === "verify-email" && token);
    if (hasEmail && !validEmail(email)) next.email = t.emailRequired;
    if (
      action === "login" &&
      (!values.password || values.password.length > 128)
    )
      next.password = t.passwordRequired;
    if (action === "register" && !validName(values.full_name))
      next.full_name = t.nameRequired;
    if (action === "register" || action === "reset-password") {
      if (!validPassword(values.password)) next.password = t.passwordInvalid;
      if (values.confirm !== values.password)
        next.confirm = t.passwordsMismatch;
    }
    setErrors(next);
    setError(null);
    setSuccess("");
    if (Object.keys(next).length) return;
    setBusy(true);
    const operation = new AbortController();
    pending.current = operation;
    const sessionAtSubmit = controller.getSnapshot();
    try {
      if (action === "login") {
        await controller.login({ email, password: values.password });
        if (!active.current) return;
        change("password", "");
        navigate(returnTo, { replace: true });
      } else if (action === "register") {
        await api.request<components["schemas"]["UserOut"]>(
          "/api/v1/auth/register",
          {
            method: "POST",
            signal: operation.signal,
            body: {
              email,
              password: values.password,
              full_name: values.full_name.trim(),
              role: values.role === "organizer" ? "organizer" : "attendee",
            } satisfies components["schemas"]["RegisterIn"],
          },
        );
        if (!active.current) return;
        setValues((previous) => ({ ...previous, password: "", confirm: "" }));
        setSuccess("registrationSent");
      } else if (action === "verify-email" && token) {
        await api.request("/api/v1/auth/verify-email", {
          method: "POST",
          signal: operation.signal,
          body: { token } satisfies components["schemas"]["VerifyEmailIn"],
        });
        if (!active.current) return;
        setSuccess("verified");
      } else if (action === "reset-password") {
        if (!token) {
          setSuccess("");
          return;
        }
        await api.request("/api/v1/auth/reset-password", {
          method: "POST",
          signal: operation.signal,
          body: {
            token,
            new_password: values.password,
          } satisfies components["schemas"]["ResetPasswordIn"],
        });
        if (!active.current) return;
        // P1 invalidates all sessions after a password change; clear the local account/cache too.
        if (controller.getSnapshot() === sessionAtSubmit)
          await controller.logout().catch(() => {});
        if (!active.current) return;
        setValues((previous) => ({ ...previous, password: "", confirm: "" }));
        setSuccess("passwordReset");
      } else {
        const verification = action === "verify-email";
        await api.request(
          `/api/v1/auth/${verification ? "resend-verification" : "forgot-password"}`,
          {
            method: "POST",
            signal: operation.signal,
            body: { email } satisfies components["schemas"]["ForgotPasswordIn"],
          },
        );
        if (!active.current) return;
        setSuccess(verification ? "verificationSent" : "resetSent");
      }
    } catch (caught) {
      if (!active.current || operation.signal.aborted) return;
      setError(caught);
      const serverFields = fieldErrors(
        caught,
        ["email", "full_name", "password", "new_password"],
        locale,
      );
      if (serverFields.new_password) {
        serverFields.password = serverFields.new_password;
        delete serverFields.new_password;
      }
      setErrors(serverFields);
    } finally {
      if (active.current) setBusy(false);
    }
  }

  const showPassword =
    kind === "login" || kind === "register" || kind === "reset-password";
  const hasTokenForm = kind === "verify-email" && Boolean(token);
  const succeeded =
    success === "registrationSent" ||
    success === "verified" ||
    success === "passwordReset";
  if (user && (kind === "login" || kind === "register"))
    return <Navigate to={returnTo} replace />;
  return (
    <section className="auth-page" aria-labelledby="auth-title">
      <h1 id="auth-title">{titles[kind]}</h1>
      {kind === "login" ? <p>{t.memorySession}</p> : null}
      {reason && kind === "login" ? (
        <Status>{reason === "suspended" ? t.suspended : t.expired}</Status>
      ) : null}
      {kind === "verify-email" ? <p>{t.verifyHelp}</p> : null}
      {success ? (
        <Status>
          {
            t[
              success as
                | "registrationSent"
                | "verified"
                | "passwordReset"
                | "verificationSent"
                | "resetSent"
            ]
          }
        </Status>
      ) : null}
      <FormError error={error} fields={errors} locale={locale} />
      {kind === "reset-password" && !token && !succeeded ? (
        <>
          <Status>{t.tokenMissing}</Status>
          <Link to={`/forgot-password${suffix}`}>{t.sendReset}</Link>
        </>
      ) : !succeeded ? (
        <form
          noValidate
          onSubmit={(event) => {
            void submit(event);
          }}
          aria-busy={busy}
        >
          <fieldset disabled={busy}>
            {kind === "register" ? (
              <Field
                label={t.fullName}
                name="full_name"
                autoComplete="name"
                maxLength={200}
                required
                value={values.full_name}
                error={errors.full_name}
                onChange={(e) => change("full_name", e.target.value)}
              />
            ) : null}
            {kind !== "reset-password" && !hasTokenForm ? (
              <Field
                label={t.email}
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                value={values.email}
                error={errors.email}
                onChange={(e) => change("email", e.target.value)}
              />
            ) : null}
            {showPassword ? (
              <Field
                label={kind === "reset-password" ? t.newPassword : t.password}
                name="password"
                type="password"
                autoComplete={
                  kind === "login" ? "current-password" : "new-password"
                }
                maxLength={128}
                required
                hint={kind === "login" ? undefined : t.passwordHint}
                value={values.password}
                error={errors.password ?? errors.new_password}
                onChange={(e) => change("password", e.target.value)}
              />
            ) : null}
            {kind === "register" || kind === "reset-password" ? (
              <Field
                label={t.confirmPassword}
                name="confirm"
                type="password"
                autoComplete="new-password"
                maxLength={128}
                required
                value={values.confirm}
                error={errors.confirm}
                onChange={(e) => change("confirm", e.target.value)}
              />
            ) : null}
            {kind === "register" ? (
              <div className="field">
                <label htmlFor="role">{t.role}</label>
                <select
                  id="role"
                  name="role"
                  value={values.role}
                  onChange={(e) => change("role", e.target.value)}
                >
                  <option value="attendee">{t.attendee}</option>
                  <option value="organizer">{t.organizerRole}</option>
                </select>
              </div>
            ) : null}
            <button type="submit">
              {busy
                ? t.working
                : kind === "verify-email"
                  ? hasTokenForm
                    ? t.verify
                    : t.resend
                  : kind === "forgot-password"
                    ? t.sendReset
                    : kind === "reset-password"
                      ? t.reset
                      : titles[kind]}
            </button>
          </fieldset>
        </form>
      ) : null}
      <nav className="auth-links" aria-label={titles[kind]}>
        {kind !== "login" ? (
          <Link to={`/login${suffix}`}>{t.login}</Link>
        ) : (
          <>
            <Link to={`/register${suffix}`}>{t.register}</Link>
            <Link to={`/forgot-password${suffix}`}>{t.forgot}</Link>
          </>
        )}
        {kind !== "verify-email" || hasTokenForm ? (
          <Link
            to={`/verify-email${suffix}`}
            onClick={() => {
              setToken("");
              setSuccess("");
              setError(null);
              setErrors({});
            }}
          >
            {t.resend}
          </Link>
        ) : null}
        {kind === "reset-password" ? (
          <Link to={`/forgot-password${suffix}`}>{t.sendReset}</Link>
        ) : null}
      </nav>
    </section>
  );
}
