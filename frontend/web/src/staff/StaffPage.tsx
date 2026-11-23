import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, formatDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { Field, Status } from "../auth/ui";
import { eventPath, parseEvent, useCommerceQuery } from "../checkout/data";
import { staffCopy } from "./copy";
import {
  parseStaff,
  staffMemberPath,
  staffPath,
  staffRoles,
  validStaffEmail,
} from "./model";
import type { StaffMember, StaffRole } from "./model";

export default function StaffPage({ locale }: { locale: Locale }) {
  const { eventId = "" } = useParams();
  return <StaffContent key={eventId} eventId={eventId} locale={locale} />;
}

function failureMessage(error: unknown, t: (typeof staffCopy)["en"]) {
  if (!(error instanceof ApiError)) return t.error;
  if (error.code === "user_not_found") return t.userNotFound;
  if (error.code === "staff_already_assigned") return t.duplicate;
  if (error.status === 403) return t.denied;
  if (error.status === 422) return t.invalidEmail;
  return t.error;
}

function StaffContent({ eventId, locale }: { eventId: string; locale: Locale }) {
  const t = staffCopy[locale];
  const { user, controller } = useSession();
  const client = useQueryClient();
  const event = useCommerceQuery(eventPath(eventId), parseEvent);
  const key = ["f7-staff", user?.id, eventId];
  const staff = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      parseStaff(await controller.request(staffPath(eventId), { signal })),
    enabled: !!user && !!eventId,
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<StaffRole>("checkin");
  const [emailError, setEmailError] = useState("");
  const [notice, setNotice] = useState("");
  const [confirming, setConfirming] = useState<StaffMember | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const add = useMutation({
    mutationFn: (body: { email: string; role: StaffRole }) =>
      controller.request(staffPath(eventId), { method: "POST", body }),
    retry: false,
    onSuccess: () => {
      setEmail("");
      setNotice(t.added);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (member: StaffMember) =>
      controller.request(staffMemberPath(eventId, member.user_id), {
        method: "DELETE",
      }),
    retry: false,
    onSuccess: () => {
      setConfirming(null);
      setNotice(t.removed);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const actionError = add.error ?? remove.error;
  useEffect(() => {
    if (actionError) errorRef.current?.focus();
  }, [actionError]);

  function submit(e: FormEvent) {
    e.preventDefault();
    setNotice("");
    remove.reset();
    if (!validStaffEmail(email)) {
      setEmailError(t.invalidEmail);
      return;
    }
    setEmailError("");
    add.mutate({ email: email.trim(), role });
  }

  const busy = add.isPending || remove.isPending;

  return (
    <section>
      <Link to="/organizer/events">{t.events}</Link>
      <h1>{t.title}</h1>
      {event.data ? <p className="event-heading">{event.data.title}</p> : null}
      <p>{t.intro}</p>
      <p className="field-hint">{t.appHint}</p>
      {notice ? <Status>{notice}</Status> : null}
      {actionError ? (
        <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          <p>{failureMessage(actionError, t)}</p>
        </div>
      ) : null}

      <h2>{t.add}</h2>
      <form onSubmit={submit} noValidate aria-busy={add.isPending}>
        <Field
          label={t.email}
          name="staff-email"
          type="email"
          autoComplete="off"
          value={email}
          hint={t.emailHint}
          error={emailError}
          onChange={(e) => setEmail(e.target.value)}
          disabled={busy}
        />
        <fieldset disabled={busy}>
          <legend>{t.role}</legend>
          {staffRoles.map((value) => (
            <label key={value} className="checkbox-field">
              <input
                type="radio"
                name="staff-role"
                value={value}
                checked={role === value}
                onChange={() => setRole(value)}
              />
              {t.roles[value]}
            </label>
          ))}
        </fieldset>
        <button type="submit" disabled={busy}>
          {add.isPending ? t.working : t.submit}
        </button>
      </form>

      <h2>{t.title}</h2>
      {staff.isPending ? <Status>{t.loading}</Status> : null}
      {staff.isError ? (
        <div className="form-error" role="alert">
          <p>{failureMessage(staff.error, t)}</p>
          <button type="button" onClick={() => void staff.refetch()}>
            {t.retry}
          </button>
        </div>
      ) : null}
      {staff.data && staff.data.length === 0 ? <p>{t.empty}</p> : null}
      {staff.data && staff.data.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t.name}</th>
                <th scope="col">{t.email}</th>
                <th scope="col">{t.role}</th>
                <th scope="col">{t.since}</th>
                <th scope="col">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {staff.data.map((member) => (
                <tr key={member.user_id}>
                  <th scope="row">{member.full_name}</th>
                  <td>{member.email}</td>
                  <td>{t.shortRoles[member.role] ?? member.role}</td>
                  <td>
                    {formatDateTime(member.assigned_at, locale)}
                  </td>
                  <td>
                    {confirming?.user_id === member.user_id ? (
                      <div role="group" aria-label={t.confirm}>
                        <p>{t.confirmRemove(member.full_name)}</p>
                        <div className="controls">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => remove.mutate(member)}
                          >
                            {remove.isPending ? t.working : t.confirm}
                          </button>
                          <button
                            type="button"
                            className="secondary"
                            disabled={busy}
                            onClick={() => setConfirming(null)}
                          >
                            {t.cancel}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="secondary"
                        disabled={busy}
                        aria-label={`${t.remove}: ${member.full_name}`}
                        onClick={() => {
                          setNotice("");
                          add.reset();
                          setConfirming(member);
                        }}
                      >
                        {t.remove}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
