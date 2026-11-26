import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, formatDateTime } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { Field, Status } from "../auth/ui";
import { staffCopy } from "./copy";
import {
  parseVolunteerCredentials,
  parseVolunteers,
  volunteerPath,
  volunteerResetPath,
  volunteersPath,
} from "./model";
import type { Volunteer, VolunteerCredentials } from "./model";

type Copy = (typeof staffCopy)["en"];

function failureMessage(error: unknown, t: Copy) {
  if (!(error instanceof ApiError)) return t.error;
  if (error.code === "event_ended") return t.volunteers.eventEnded;
  if (error.code === "volunteer_limit_reached") return t.volunteers.limit;
  if (error.status === 403) return t.denied;
  return t.error;
}

function CopyButton({ value, label, t }: { value: string; label: string; t: Copy }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className="secondary"
      aria-label={`${t.volunteers.copy}: ${label}`}
      onClick={() => {
        void navigator.clipboard
          ?.writeText(value)
          .then(() => setCopied(true))
          .catch(() => undefined);
      }}
    >
      {copied ? t.volunteers.copied : t.volunteers.copy}
    </button>
  );
}

/** One-time display of a volunteer's sign-in details, after creation or a password reset. */
function Credentials({
  credentials,
  locale,
  onDone,
}: {
  credentials: VolunteerCredentials;
  locale: Locale;
  onDone: () => void;
}) {
  const t = staffCopy[locale];
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div
      className="panel volunteer-credentials"
      role="region"
      aria-label={t.volunteers.credentialsTitle(credentials.full_name)}
      tabIndex={-1}
      ref={ref}
    >
      <h3>{t.volunteers.credentialsTitle(credentials.full_name)}</h3>
      <p className="field-hint">{t.volunteers.credentialsHint}</p>
      <dl>
        <div>
          <dt>{t.volunteers.login}</dt>
          <dd>
            <code>{credentials.login}</code>
            <CopyButton value={credentials.login} label={t.volunteers.login} t={t} />
          </dd>
        </div>
        <div>
          <dt>{t.volunteers.password}</dt>
          <dd>
            <code>{credentials.password}</code>
            <CopyButton value={credentials.password} label={t.volunteers.password} t={t} />
          </dd>
        </div>
      </dl>
      <p className="field-hint">
        {t.volunteers.expires(formatDateTime(credentials.expires_at, locale))}
      </p>
      <button type="button" onClick={onDone}>
        {t.volunteers.done}
      </button>
    </div>
  );
}

export function VolunteersPanel({ eventId, locale }: { eventId: string; locale: Locale }) {
  const t = staffCopy[locale];
  const { user, controller } = useSession();
  const client = useQueryClient();
  const key = ["volunteers", user?.id, eventId];
  const volunteers = useQuery({
    queryKey: key,
    queryFn: async ({ signal }) =>
      parseVolunteers(await controller.request(volunteersPath(eventId), { signal })),
    enabled: !!user && !!eventId,
    retry: false,
  });
  const [name, setName] = useState("");
  const [nameError, setNameError] = useState("");
  const [notice, setNotice] = useState("");
  const [shown, setShown] = useState<VolunteerCredentials | null>(null);
  const [confirming, setConfirming] = useState<Volunteer | null>(null);
  const errorRef = useRef<HTMLDivElement>(null);

  const create = useMutation({
    mutationFn: async (full_name: string) =>
      parseVolunteerCredentials(
        await controller.request(volunteersPath(eventId), {
          method: "POST",
          body: { full_name },
        }),
      ),
    retry: false,
    onSuccess: (credentials) => {
      setName("");
      setNotice(t.volunteers.created);
      setShown(credentials);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const reset = useMutation({
    mutationFn: async (volunteer: Volunteer) =>
      parseVolunteerCredentials(
        await controller.request(volunteerResetPath(eventId, volunteer.user_id), {
          method: "POST",
        }),
      ),
    retry: false,
    onSuccess: (credentials) => {
      setNotice(t.volunteers.resetDone);
      setShown(credentials);
    },
  });
  const remove = useMutation({
    mutationFn: (volunteer: Volunteer) =>
      controller.request(volunteerPath(eventId, volunteer.user_id), { method: "DELETE" }),
    retry: false,
    onSuccess: (_, volunteer) => {
      setConfirming(null);
      setNotice(t.volunteers.removed);
      if (shown?.user_id === volunteer.user_id) setShown(null);
    },
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  const actionError = create.error ?? reset.error ?? remove.error;
  useEffect(() => {
    if (actionError) errorRef.current?.focus();
  }, [actionError]);
  const busy = create.isPending || reset.isPending || remove.isPending;

  function clearFeedback() {
    setNotice("");
    create.reset();
    reset.reset();
    remove.reset();
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    clearFeedback();
    if (!name.trim()) {
      setNameError(t.volunteers.nameRequired);
      return;
    }
    setNameError("");
    create.mutate(name.trim());
  }

  return (
    <section aria-labelledby="volunteers-title">
      <h2 id="volunteers-title">{t.volunteers.title}</h2>
      {notice ? <Status>{notice}</Status> : null}
      {actionError ? (
        <div className="form-error" role="alert" tabIndex={-1} ref={errorRef}>
          <p>{failureMessage(actionError, t)}</p>
        </div>
      ) : null}
      {shown ? (
        <Credentials credentials={shown} locale={locale} onDone={() => setShown(null)} />
      ) : null}

      <form className="panel staff-form" onSubmit={submit} noValidate aria-busy={create.isPending}>
        <p className="field-hint">{t.volunteers.intro}</p>
        <Field
          label={t.volunteers.name}
          name="volunteer-name"
          autoComplete="off"
          maxLength={200}
          value={name}
          error={nameError}
          onChange={(e) => setName(e.target.value)}
          disabled={busy}
        />
        <button type="submit" disabled={busy}>
          {create.isPending ? t.working : t.volunteers.create}
        </button>
      </form>

      <h3>{t.volunteers.listTitle}</h3>
      {volunteers.isPending ? <Status>{t.loading}</Status> : null}
      {volunteers.isError ? (
        <div className="form-error" role="alert">
          <p>{failureMessage(volunteers.error, t)}</p>
          <button type="button" onClick={() => void volunteers.refetch()}>
            {t.retry}
          </button>
        </div>
      ) : null}
      {volunteers.data && volunteers.data.length === 0 ? (
        <p className="empty-state">{t.volunteers.empty}</p>
      ) : null}
      {volunteers.data && volunteers.data.length > 0 ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th scope="col">{t.name}</th>
                <th scope="col">{t.volunteers.login}</th>
                <th scope="col">{t.volunteers.lastLogin}</th>
                <th scope="col">{t.actions}</th>
              </tr>
            </thead>
            <tbody>
              {volunteers.data.map((volunteer) => (
                <tr key={volunteer.user_id}>
                  <th scope="row">{volunteer.full_name}</th>
                  <td>
                    <code>{volunteer.login}</code>
                  </td>
                  <td>
                    {volunteer.last_login_at
                      ? formatDateTime(volunteer.last_login_at, locale)
                      : t.volunteers.never}
                  </td>
                  <td>
                    {confirming?.user_id === volunteer.user_id ? (
                      <div role="group" aria-label={t.volunteers.confirm}>
                        <p>{t.volunteers.confirmRemove(volunteer.full_name)}</p>
                        <div className="controls">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => remove.mutate(volunteer)}
                          >
                            {remove.isPending ? t.working : t.volunteers.confirm}
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
                      <div className="controls">
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${t.volunteers.reset}: ${volunteer.full_name}`}
                          onClick={() => {
                            clearFeedback();
                            reset.mutate(volunteer);
                          }}
                        >
                          {reset.isPending && reset.variables?.user_id === volunteer.user_id
                            ? t.working
                            : t.volunteers.reset}
                        </button>
                        <button
                          type="button"
                          className="secondary"
                          disabled={busy}
                          aria-label={`${t.volunteers.remove}: ${volunteer.full_name}`}
                          onClick={() => {
                            clearFeedback();
                            setConfirming(volunteer);
                          }}
                        >
                          {t.volunteers.remove}
                        </button>
                      </div>
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
