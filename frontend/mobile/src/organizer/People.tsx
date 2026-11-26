import { useState } from "react";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { validEmail, validName } from "@biletflow/shared/features/auth/helpers";
import { queryKeys } from "@biletflow/shared/features/query-keys";
import { staffCopy } from "@biletflow/shared/features/staff/copy";
import { parseStaff, staffMemberPath, staffPath, staffRoles, validStaffEmail } from "@biletflow/shared/features/staff/model";
import type { StaffMember, StaffRole } from "@biletflow/shared/features/staff/model";
import { AuthField, useDiscardChanges } from "../auth/Fields";
import { Failure, Read, request, useResource } from "../features/resource";
import { useWrite } from "../features/use-write";
import { ConfirmSheet } from "../kit/ConfirmSheet";
import { Select } from "../kit/Select";
import { useSessionSnapshot } from "../session";
import { Action, Card, Heading, Muted, Pill, Screen, Title } from "../ui";

type Profile = components["schemas"]["OrganizerProfileOut"];
const profilePath = "/api/v1/organizers/me";
const profile = (value: unknown) => value as Profile;

export function OrganizerProfile({ locale, open }: { locale: Locale; open: (path: string) => void }) {
  const { user } = useSessionSnapshot();
  const t = authCopy[locale];
  const resource = useResource(profilePath, profile, { key: queryKeys.organizerProfile(user?.id) });
  return <Screen>
    <Title>{t.organizer}</Title>
    {!user?.email_verified_at ? <>
      <Muted>{t.publicationNote}</Muted>
      <Action title={t.resend} onPress={() => open("/verify-email?returnTo=%2Forganizer%2Fprofile")} />
    </> : <Pill label={t.verifiedStatus} tone="success" />}
    <Read resource={resource} locale={locale}>{(data) => <ProfileForm key={data.id} profile={data} locale={locale}
      refresh={() => void resource.refetch()} />}</Read>
  </Screen>;
}

function ProfileForm({ profile: current, locale, refresh }: { profile: Profile; locale: Locale; refresh: () => void }) {
  const t = authCopy[locale];
  const [name, setName] = useState(current.organization_name);
  const [email, setEmail] = useState(current.contact_email);
  const [phone, setPhone] = useState(current.contact_phone);
  const write = useWrite("organizer:profile");
  const dirty = name !== current.organization_name || email !== current.contact_email || phone !== current.contact_phone;
  const discard = useDiscardChanges(dirty, locale);
  const statuses = { verified: t.approved, pending: t.pending, rejected: t.rejected, unverified: t.unverifiedOrganizer };
  return <>
    <Heading>{t.organizerVerification}</Heading>
    <Pill label={statuses[current.verification_status as keyof typeof statuses] ?? t.unknownStatus} />
    <Muted>{t.organizerVerificationNote}</Muted>
    <AuthField label={t.organizationName} value={name} onChangeText={setName} maxLength={200} editable={!write.busy} />
    <AuthField label={t.contactEmail} value={email} onChangeText={setEmail} inputMode="email" autoCapitalize="none" editable={!write.busy} />
    <AuthField label={t.contactPhone} value={phone} onChangeText={setPhone} inputMode="tel" maxLength={32} editable={!write.busy} />
    <Failure error={write.error} locale={locale} />
    <Action title={t.save} variant="primary" busy={write.busy}
      disabled={write.busy || !dirty || !validName(name) || !validEmail(email.trim())}
      onPress={() => void write.run(() => request(profilePath, { method: "PATCH", body: {
        organization_name: name.trim(), contact_email: email.trim(), contact_phone: phone.trim(),
      } }), true).then((result) => { if (result) refresh(); })} />
    {write.saved ? <Muted>{t.saved}</Muted> : null}
    {discard}
  </>;
}

export function Staff({ id, locale }: { id: string; locale: Locale }) {
  const t = staffCopy[locale];
  const roster = useResource(staffPath(id), parseStaff);
  const write = useWrite(`staff:${id}`);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("checkin");
  const [target, setTarget] = useState<StaffMember | null>(null);
  const discard = useDiscardChanges(Boolean(email), locale);
  return <Screen>
    <Title>{t.title}</Title>
    <Muted>{t.intro}</Muted>
    <Read resource={roster} locale={locale}>{(data) => <>
      {data.length ? data.map((member) => <Card key={member.user_id}>
        <Heading>{member.full_name}</Heading>
        <Muted>{member.email}</Muted>
        <Pill label={t.shortRoles[member.role] ?? member.role} />
        <Action title={t.remove} onPress={() => setTarget(member)} disabled={write.busy} />
      </Card>) : <Muted>{t.empty}</Muted>}
      <Heading>{t.add}</Heading>
      <AuthField label={t.email} hint={t.emailHint} value={email} onChangeText={setEmail}
        inputMode="email" autoCapitalize="none" editable={!write.busy} />
      <Select label={t.role} value={role} locale={locale} options={staffRoles.map((value) => ({ value, label: t.roles[value] }))}
        onChange={setRole} disabled={write.busy} />
      <Action title={t.submit} variant="primary" disabled={!validStaffEmail(email) || write.busy || write.uncertain} busy={write.busy}
        onPress={() => void write.run(async () => {
          await request(staffPath(id), { method: "POST", body: { email: email.trim(), role } });
          setEmail("");
          await roster.refetch();
        })} />
      <Action title={t.retry} onPress={() => void roster.refetch()} />
    </>}</Read>
    <Failure error={write.error} locale={locale} />
    {write.uncertain ? <Muted>{authCopy[locale].unknown}</Muted> : null}
    <ConfirmSheet visible={Boolean(target)} title={t.remove} body={target ? t.confirmRemove(target.full_name) : undefined}
      confirmLabel={t.confirm} cancelLabel={t.cancel} busy={write.busy} onCancel={() => setTarget(null)}
      onConfirm={() => {
        if (!target) return;
        void write.run(async () => {
          await request(staffMemberPath(id, target.user_id), { method: "DELETE" });
          await roster.refetch();
        }, true).finally(() => setTarget(null));
      }} />
    {discard}
  </Screen>;
}
