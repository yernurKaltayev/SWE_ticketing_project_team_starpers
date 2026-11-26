import { useEffect, useRef, useState } from "react";
import { View } from "react-native";
import { ApiError } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { fieldErrors, kazakhstanPhone, validEmail, validName, validPassword } from "@biletflow/shared/features/auth/helpers";
import { authCopy as mobileCopy } from "../auth-copy";
import { Select } from "../kit/Select";
import type { AuthParams, AuthScreenName } from "../navigation/auth-routes";
import { api, session, useSessionSnapshot } from "../session";
import { Action, Callout, Muted, styles, Title } from "../ui";
import { AuthError, AuthField, useDiscardChanges } from "./Fields";

type Status = "registrationSent" | "verified" | "passwordReset" | "verificationSent" | "resetSent";

export function AuthForm({
  screen,
  locale,
  params,
  onNavigate,
  confirmDiscard = false,
}: {
  screen: AuthScreenName;
  locale: Locale;
  params?: AuthParams;
  onNavigate: (screen: AuthScreenName, params?: AuthParams) => void;
  confirmDiscard?: boolean;
}) {
  const t = authCopy[locale];
  const snapshot = useSessionSnapshot();
  const [email, setEmail] = useState(params?.email ?? "");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [role, setRole] = useState<"attendee" | "organizer">("attendee");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [verifyFailed, setVerifyFailed] = useState(false);
  const inFlight = useRef(false);
  const register = screen === "Register";
  const login = screen === "Login";
  const verify = screen === "VerifyEmail";
  const reset = screen === "ResetPassword";
  const token = params?.token;
  const verifying = verify && Boolean(token) && !verifyFailed && !success;
  const missingToken = reset && !token;
  const completed = success === "verified" || success === "passwordReset" || success === "registrationSent";
  const discard = useDiscardChanges(
    confirmDiscard && !completed && !((login || register) && snapshot.user) &&
      Boolean(email !== (params?.email ?? "") || name || phone || password || confirm || role !== "attendee"),
    locale,
  );

  // One POST per opened link. Within a mounted screen a failed verification falls back to resend.
  const openedToken = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!verify || !token || !api || openedToken.current === token) return;
    openedToken.current = token;
    setBusy(true);
    setVerifyFailed(false);
    setSuccess(null);
    setError(null);
    void api.request("/api/v1/auth/verify-email", {
      method: "POST",
      body: { token } satisfies components["schemas"]["VerifyEmailIn"],
    }).then(
      () => {
        setSuccess("verified");
        if (session?.getSnapshot().user) void session.reloadUser().catch(() => undefined);
      },
      (caught: unknown) => {
        setError(caught);
        setVerifyFailed(true);
      },
    ).finally(() => setBusy(false));
  }, [verify, token]);

  async function submit() {
    if (!api || !session || inFlight.current || completed || missingToken || verifying) return;
    const address = email.trim();
    const number = kazakhstanPhone(phone);
    const validation: Record<string, string> = {};
    if (!reset && !validEmail(address)) validation.email = t.emailRequired;
    if (login && (!password || password.length > 128)) validation.password = t.passwordRequired;
    if (register && !validName(name)) validation.full_name = t.nameRequired;
    if (register && !number) validation.phone = t.phoneInvalid;
    if (register || reset) {
      if (!validPassword(password)) validation.password = t.passwordInvalid;
      if (password !== confirm) validation.confirm = t.passwordsMismatch;
    }
    setErrors(validation);
    setError(null);
    setSuccess(null);
    if (Object.keys(validation).length > 0) return;
    inFlight.current = true;
    setBusy(true);
    try {
      if (login) {
        await session.login({ email: address, password });
      } else if (register) {
        await api.request("/api/v1/auth/register", {
          method: "POST",
          body: {
            email: address,
            password,
            full_name: name.trim(),
            role,
            phone: number!,
          } satisfies components["schemas"]["RegisterIn"],
        });
        setSuccess("registrationSent");
      } else if (reset) {
        const sessionAtSubmit = session.getSnapshot();
        await api.request("/api/v1/auth/reset-password", {
          method: "POST",
          body: { token: token!, new_password: password } satisfies components["schemas"]["ResetPasswordIn"],
        });
        if (session.getSnapshot() === sessionAtSubmit) await session.logout().catch(() => undefined);
        setSuccess("passwordReset");
      } else {
        const endpoint = verify ? "resend-verification" : "forgot-password";
        await api.request(`/api/v1/auth/${endpoint}`, {
          method: "POST",
          body: { email: address } satisfies components["schemas"]["ForgotPasswordIn"],
        });
        setSuccess(verify ? "verificationSent" : "resetSent");
      }
      setPassword("");
      setConfirm("");
    } catch (caught) {
      const fields = fieldErrors(caught, ["email", "full_name", "phone", "password", "new_password"], locale);
      if (fields.new_password) fields.password = fields.new_password;
      setErrors(fields);
      setError(caught);
      if (login) setPassword("");
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  const title = {
    Login: t.login,
    Register: t.register,
    VerifyEmail: success === "verified" ? t.verifiedTitle : t.verifyTitle,
    ForgotPassword: t.forgotTitle,
    ResetPassword: t.resetTitle,
  }[screen];
  const submitLabel = {
    Login: t.login,
    Register: t.register,
    VerifyEmail: t.resend,
    ForgotPassword: t.sendReset,
    ResetPassword: t.reset,
  }[screen];
  const navigate = (destination: AuthScreenName) =>
    onNavigate(destination, { returnTo: params?.returnTo, email: email.trim() });

  if (!session) {
    return (
      <>
        <Title>{title}</Title>
        <Callout tone="warning">{mobileCopy[locale].config}</Callout>
      </>
    );
  }
  if (login && snapshot.status === "loading" && !busy)
    return <Muted live="polite">{t.loading}</Muted>;

  return (
    <View style={styles.stack}>
      <Title subtitle={login ? t.sessionNote : undefined}>{title}</Title>
      {login && snapshot.reason && !error ? (
        <Callout tone="warning">{snapshot.reason === "suspended" ? t.suspended : t.expired}</Callout>
      ) : null}
      {verify && !verifying && !completed ? <Muted>{t.verifyHelp}</Muted> : null}
      {verifying ? <Callout tone="info">{t.confirming}</Callout> : null}
      {success ? <Callout tone="success">{t[success]}</Callout> : null}
      {missingToken ? <Callout tone="warning">{t.tokenMissing}</Callout> : null}
      <AuthError error={error} locale={locale} />
      {!completed && !missingToken && !verifying ? (
        <>
          {register ? (
            <AuthField label={t.fullName} value={name} onChangeText={setName}
              error={errors.full_name} autoComplete="name" maxLength={200} editable={!busy} />
          ) : null}
          {!reset ? (
            <AuthField label={t.email} value={email} onChangeText={setEmail}
              error={errors.email} autoComplete="email" autoCapitalize="none" autoCorrect={false}
              inputMode="email" editable={!busy} />
          ) : null}
          {register ? (
            <AuthField label={t.phone} value={phone} onChangeText={setPhone} hint={t.phoneHint}
              error={errors.phone} autoComplete="tel" inputMode="tel" maxLength={32} editable={!busy} />
          ) : null}
          {login || register || reset ? (
            <AuthField label={reset ? t.newPassword : t.password} value={password} onChangeText={setPassword}
              error={errors.password} autoComplete={login ? "current-password" : "new-password"}
              autoCapitalize="none" autoCorrect={false} secureTextEntry maxLength={128} editable={!busy} />
          ) : null}
          {register || reset ? (
            <AuthField label={t.confirmPassword} value={confirm} onChangeText={setConfirm}
              error={errors.confirm} autoComplete="new-password" autoCapitalize="none" autoCorrect={false}
              secureTextEntry maxLength={128} editable={!busy} />
          ) : null}
          {register ? (
            <Select label={t.role} locale={locale} value={role} onChange={setRole} disabled={busy}
              options={[{ value: "attendee", label: t.attendee }, { value: "organizer", label: t.organizerRole }]} />
          ) : null}
          <Action title={busy ? t.working : submitLabel} variant="primary" busy={busy}
            disabled={busy} onPress={() => void submit()} />
        </>
      ) : null}
      {!verifying && !busy ? (
        <>
          {login ? (
            <>
              <Action title={t.register} onPress={() => navigate("Register")} />
              <Action title={t.forgot} onPress={() => navigate("ForgotPassword")} />
            </>
          ) : <Action title={t.login} onPress={() => navigate("Login")} />}
          {!verify && success !== "passwordReset" ? (
            <Action title={t.resend} onPress={() => navigate("VerifyEmail")} />
          ) : null}
          {reset && (missingToken || (error instanceof ApiError && error.code === "invalid_reset_token")) ? (
            <Action title={t.sendReset} onPress={() => navigate("ForgotPassword")} />
          ) : null}
        </>
      ) : null}
      {discard}
    </View>
  );
}
