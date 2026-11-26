import { useRef, useState } from "react";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { fieldErrors, kazakhstanPhone, validName } from "@biletflow/shared/features/auth/helpers";
import { authCopy as mobileCopy } from "../auth-copy";
import { session } from "../session";
import { Action, Callout, Card, Muted, Pill, Title } from "../ui";
import { AuthError, AuthField, useDiscardChanges } from "./Fields";
import { PhoneVerification } from "./PhoneVerification";

type User = components["schemas"]["UserOut"];

export function Profile({ locale, user, onVerifyEmail, onLogout }: {
  locale: Locale;
  user: User;
  onVerifyEmail: () => void;
  onLogout: () => Promise<void>;
}) {
  const t = authCopy[locale];
  const [name, setName] = useState(user.full_name);
  const [phone, setPhone] = useState(user.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(false);
  const nameChanged = name.trim() !== user.full_name;
  const phoneChanged = (kazakhstanPhone(phone) ?? (phone.trim() || null)) !== user.phone;
  const dirty = nameChanged || phoneChanged;
  const discard = useDiscardChanges(dirty, locale);

  async function save() {
    if (!session || inFlight.current || !dirty) return;
    const validation: Record<string, string> = {};
    const number = kazakhstanPhone(phone);
    if (!validName(name)) validation.full_name = t.nameRequired;
    if (phone.trim() && !number) validation.phone = t.phoneInvalid;
    setErrors(validation);
    setError(null);
    setSaved(false);
    if (Object.keys(validation).length > 0) return;
    const body: components["schemas"]["UserUpdate"] = {};
    if (nameChanged) body.full_name = name.trim();
    if (phoneChanged) body.phone = number;
    inFlight.current = true;
    setBusy(true);
    try {
      const updated = await session.request<User>("/api/v1/me", { method: "PATCH", body });
      session.updateUser(updated);
      setName(updated.full_name);
      setPhone(updated.phone ?? "");
      setSaved(true);
    } catch (caught) {
      setError(caught);
      setErrors(fieldErrors(caught, ["full_name", "phone"], locale));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Title>{t.account}</Title>
      <Card>
        <Muted>{user.email}</Muted>
        <Pill label={user.email_verified_at ? t.verifiedStatus : t.unverifiedStatus}
          tone={user.email_verified_at ? "success" : "warning"} />
      </Card>
      {!user.email_verified_at ? <Action title={t.resend} disabled={busy} onPress={onVerifyEmail} /> : null}
      <AuthField label={t.fullName} value={name} onChangeText={(text) => { setName(text); setSaved(false); }}
        error={errors.full_name} autoComplete="name" maxLength={200} editable={!busy} />
      <AuthField label={t.phone} value={phone} onChangeText={(text) => { setPhone(text); setSaved(false); }}
        hint={t.phoneHint} error={errors.phone} autoComplete="tel" inputMode="tel" maxLength={32} editable={!busy} />
      <PhoneVerification key={user.phone ?? ""} locale={locale} user={user} phoneDraft={phone} disabled={busy} />
      <AuthError error={error} locale={locale} />
      {saved ? <Callout tone="success">{t.saved}</Callout> : null}
      <Action title={busy ? t.saving : t.save} variant="primary" busy={busy}
        disabled={busy || !dirty} onPress={() => void save()} />
      <Action title={mobileCopy[locale].signOut} disabled={busy || dirty}
        onPress={() => void onLogout()} />
      {discard}
    </>
  );
}
