import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import type { Locale } from "@biletflow/shared";
import { useSession } from "../auth/session";
import { Field } from "../auth/ui";
import {
  categories,
  contextFrom,
  createBody,
  definiteFailure,
  parseCase,
  parseCases,
} from "./model";
import type { Category, Context } from "./model";
import { supportCopy } from "./copy";
import { useDraft } from "./drafts";
import { useLiveQuery } from "./data";
import { ContextDetails, SupportError } from "./ui";
import "./support.css";
import { BackLink } from "../BackLink";
export default function NewCase({ locale }: { locale: Locale }) {
  const { search } = useLocation();
  const { user } = useSession();
  let context: Context;
  try {
    context = contextFrom(search);
  } catch {
    return <p role="alert">{supportCopy[locale].invalidContext}</p>;
  }
  return (
    <Compose
      key={`${user?.id}:${JSON.stringify(context)}`}
      locale={locale}
      context={context}
    />
  );
}
function Compose({ locale, context }: { locale: Locale; context: Context }) {
  const t = supportCopy[locale],
    { user, controller } = useSession(),
    navigate = useNavigate();
  const [draft, setDraft] = useDraft(`new:${JSON.stringify(context)}`, {
    subject: "",
    body: "",
    category: "technical",
  });
  const [busy, setBusy] = useState(false),
    [invalid, setInvalid] = useState(false),
    [error, setError] = useState<unknown>();
  const lock = useRef(false),
    ref = useRef<HTMLDivElement>(null);
  const recent = useLiveQuery(
    "/api/v1/support/cases?role=requester&limit=20&offset=0",
    parseCases,
    10000,
    !!draft.uncertain,
  );
  useEffect(() => {
    if (invalid || error) ref.current?.focus();
  }, [invalid, error]);
  async function submit() {
    if (lock.current || draft.uncertain) return;
    let body;
    try {
      body = createBody(draft, context);
    } catch {
      setInvalid(true);
      return;
    }
    lock.current = true;
    setBusy(true);
    setError(undefined);
    setInvalid(false);
    const owner = user?.id;
    try {
      const c = parseCase(
        await controller.request("/api/v1/support/cases", {
          method: "POST",
          body,
        }),
      );
      if (controller.getSnapshot().user?.id !== owner) return;
      if (c.requester_id !== owner) throw new Error("invalid_requester");
      setDraft({ subject: "", body: "", category: "technical" });
      navigate(`/support/cases/${encodeURIComponent(c.id)}`, { replace: true });
    } catch (e) {
      if (controller.getSnapshot().user?.id === owner) {
        setError(e);
        if (!definiteFailure(e)) setDraft({ ...draft, uncertain: true });
      }
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="support-page">
      <BackLink to="/support">{t.back}</BackLink>
      <h1>{t.newCase}</h1>
      <div className="support-new-layout">
      <aside className="support-new-aside">
        <ContextDetails context={context} t={t} own />
        <p className="support-new-hint">{t.composeHint}</p>
      </aside>
      <div className="support-new-main">
      <div tabIndex={-1} ref={ref}>
        {invalid && <p role="alert">{t.invalid}</p>}
        <SupportError error={error} t={t} />
      </div>
      {draft.uncertain && (
        <div className="support-card">
          <p role="alert">{t.unknown}</p>
          <Link to="/support?role=requester">{t.mine}</Link>
          <button
            className="secondary"
            disabled={recent.isFetching}
            onClick={() => void recent.refetch()}
          >
            {t.refresh}
          </button>
          <SupportError error={recent.error} t={t} />
          {recent.data && !recent.isError && (
            <ul>
              {recent.data.items.map((c) => (
                <li key={c.id}>
                  <Link to={`/support/cases/${encodeURIComponent(c.id)}`}>
                    {c.subject}
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <button
            disabled={!recent.data || recent.isError || recent.isFetching}
            onClick={() => {
              setDraft({ ...draft, uncertain: false });
              setError(undefined);
            }}
          >
            {t.checked}
          </button>
        </div>
      )}
      <form
        className="support-compose"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <fieldset disabled={busy || draft.uncertain}>
          <Field
            label={t.subject}
            name="support-subject"
            maxLength={200}
            required
            value={draft.subject}
            onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
          />
          <label htmlFor="support-category">{t.category}</label>
          <select
            name="category"
            id="support-category"
            value={draft.category}
            onChange={(e) =>
              setDraft({ ...draft, category: e.target.value as Category })
            }
          >
            {categories.map((c) => (
              <option value={c} key={c}>
                {t.categories[c]}
              </option>
            ))}
          </select>
          <label htmlFor="support-message">{t.message}</label>
          <textarea
            name="message"
            id="support-message"
            maxLength={5000}
            required
            value={draft.body}
            onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          />
          <button disabled={busy || draft.uncertain}>
            {busy ? t.working : t.create}
          </button>
        </fieldset>
      </form>
      </div>
      </div>
    </section>
  );
}
