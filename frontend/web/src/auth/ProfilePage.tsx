import { useState } from "react";
import type { FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "./copy";
import { fieldErrors, validEmail, validName } from "./helpers";
import { useSession } from "./session";
import { Field, FormError, Status } from "./ui";

type OrganizerProfile = components["schemas"]["OrganizerProfileOut"];
export function ProfilePage({ locale }: { locale: Locale }) {
  const { user, controller } = useSession();
  const t = authCopy[locale];
  const [name, setName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  if (!user) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user || busy) return;
    const next: Record<string, string> = {};
    if (!validName(name)) next.full_name = t.nameRequired;
    if (phone.trim().length > 32) next.phone = t.phoneInvalid;
    setErrors(next);
    setError(null);
    setSaved(false);
    if (Object.keys(next).length) return;
    const body: components["schemas"]["UserUpdate"] = {};
    if (name.trim() !== user.full_name) body.full_name = name.trim();
    if ((phone.trim() || null) !== user.phone)
      body.phone = phone.trim() || null;
    setBusy(true);
    try {
      const updated = await controller.request<
        components["schemas"]["UserOut"]
      >("/api/v1/me", { method: "PATCH", body });
      controller.updateUser(updated);
      setName(updated.full_name);
      setPhone(updated.phone ?? "");
      setSaved(true);
    } catch (caught) {
      setError(caught);
      setErrors(fieldErrors(caught, ["full_name", "phone"], locale));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="auth-page">
      <h1>{t.account}</h1>
      <p className="identity">{user.email}</p>
      <p>
        <span className="status-badge">
          {user.email_verified_at ? t.verifiedStatus : t.unverifiedStatus}
        </span>
      </p>
      {!user.email_verified_at ? (
        <Link to="/verify-email">{t.resend}</Link>
      ) : null}
      <FormError error={error} fields={errors} locale={locale} />
      {saved ? <Status>{t.saved}</Status> : null}
      <form
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-busy={busy}
      >
        <fieldset disabled={busy}>
          <Field
            label={t.fullName}
            name="full_name"
            autoComplete="name"
            required
            maxLength={200}
            value={name}
            error={errors.full_name}
            onChange={(event) => {
              setName(event.target.value);
              setSaved(false);
            }}
          />
          <Field
            label={t.phone}
            name="phone"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={phone}
            error={errors.phone}
            onChange={(event) => {
              setPhone(event.target.value);
              setSaved(false);
            }}
          />
          <button type="submit">{busy ? t.saving : t.save}</button>
        </fieldset>
      </form>
    </section>
  );
}

export function OrganizerPage({ locale }: { locale: Locale }) {
  const { user, controller } = useSession();
  const t = authCopy[locale];
  const profile = useQuery({
    queryKey: ["organizer-profile", user?.id],
    queryFn: ({ signal }) =>
      controller.request<OrganizerProfile>("/api/v1/organizers/me", { signal }),
    retry: false,
  });
  return (
    <section className="auth-page">
      <h1>{t.organizer}</h1>
      <p>{t.organizerIntro}</p>
      {!user?.email_verified_at ? (
        <Status>
          {t.publicationNote} <Link to="/verify-email">{t.resend}</Link>
        </Status>
      ) : (
        <p>
          <span className="status-badge">{t.verifiedStatus}</span>
        </p>
      )}
      {profile.isPending ? (
        <Status>{t.loading}</Status>
      ) : profile.isError ? (
        <>
          <FormError error={profile.error} locale={locale} />
          <button
            onClick={() => {
              void profile.refetch();
            }}
          >
            {t.retry}
          </button>
        </>
      ) : (
        <OrganizerForm
          key={profile.data.id}
          profile={profile.data}
          locale={locale}
        />
      )}
      <p className="notice">{t.payoutPending}</p>
    </section>
  );
}

function OrganizerForm({
  profile,
  locale,
}: {
  profile: OrganizerProfile;
  locale: Locale;
}) {
  const { controller, user } = useSession();
  const cache = useQueryClient();
  const t = authCopy[locale];
  const [values, setValues] = useState({
    organization_name: profile.organization_name,
    contact_email: profile.contact_email,
    contact_phone: profile.contact_phone,
  });
  const [error, setError] = useState<unknown>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const next: Record<string, string> = {};
    if (!validName(values.organization_name))
      next.organization_name = t.nameRequired;
    if (!validEmail(values.contact_email.trim()))
      next.contact_email = t.emailRequired;
    if (values.contact_phone.trim().length > 32)
      next.contact_phone = t.phoneInvalid;
    setError(null);
    setErrors(next);
    setSaved(false);
    if (Object.keys(next).length) return;
    const body: components["schemas"]["OrganizerProfileUpdate"] = {};
    for (const field of [
      "organization_name",
      "contact_email",
      "contact_phone",
    ] as const) {
      if (values[field].trim() !== profile[field])
        body[field] = values[field].trim();
    }
    setBusy(true);
    try {
      const updated = await controller.request<OrganizerProfile>(
        "/api/v1/organizers/me",
        { method: "PATCH", body },
      );
      cache.setQueryData(["organizer-profile", user?.id], updated);
      setValues({
        organization_name: updated.organization_name,
        contact_email: updated.contact_email,
        contact_phone: updated.contact_phone,
      });
      setSaved(true);
    } catch (caught) {
      setError(caught);
      setErrors(
        fieldErrors(
          caught,
          ["organization_name", "contact_email", "contact_phone"],
          locale,
        ),
      );
    } finally {
      setBusy(false);
    }
  }
  const verification =
    profile.verification_status === "pending"
      ? t.pending
      : profile.verification_status === "verified"
        ? t.approved
        : profile.verification_status === "unverified"
          ? t.unverifiedOrganizer
          : profile.verification_status === "rejected"
            ? t.rejected
            : t.unknownStatus;
  const change = (field: keyof typeof values, value: string) => {
    setValues((previous) => ({ ...previous, [field]: value }));
    setSaved(false);
  };
  return (
    <>
      <p>
        {t.organizerVerification}:{" "}
        <span className="status-badge">{verification}</span>
      </p>
      <p className="field-hint">{t.organizerVerificationNote}</p>
      <FormError error={error} fields={errors} locale={locale} />
      {saved ? <Status>{t.saved}</Status> : null}
      <form
        noValidate
        onSubmit={(event) => {
          void submit(event);
        }}
        aria-busy={busy}
      >
        <fieldset disabled={busy}>
          <Field
            label={t.organizationName}
            name="organization_name"
            autoComplete="organization"
            required
            maxLength={200}
            value={values.organization_name}
            error={errors.organization_name}
            onChange={(event) =>
              change("organization_name", event.target.value)
            }
          />
          <Field
            label={t.contactEmail}
            name="contact_email"
            type="email"
            autoComplete="email"
            required
            value={values.contact_email}
            error={errors.contact_email}
            onChange={(event) => change("contact_email", event.target.value)}
          />
          <Field
            label={t.contactPhone}
            name="contact_phone"
            type="tel"
            autoComplete="tel"
            maxLength={32}
            value={values.contact_phone}
            error={errors.contact_phone}
            onChange={(event) => change("contact_phone", event.target.value)}
          />
          <button type="submit">{busy ? t.saving : t.save}</button>
        </fieldset>
      </form>
    </>
  );
}
