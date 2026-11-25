import { useEffect, useState } from "react";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "./copy";
import { kazakhstanPhone, noFinalDot } from "./helpers";
import { useSession } from "./session";
import { FormError, Status } from "./ui";

type Started = components["schemas"]["PhoneVerificationStartOut"];
type Availability = components["schemas"]["PhoneVerificationStatusOut"];

/**
 * Phone verification through the BiletFlow Telegram bot. The bot does the checking; this page
 * gives the link, then re-reads the account until it reports the phone verified. Nothing is
 * blocked while the phone is unverified.
 */
export function PhoneVerification({
  locale,
  phoneDraft,
  pollMs = 3000,
}: {
  locale: Locale;
  /** The phone field as typed; a number that is not saved yet cannot be verified. */
  phoneDraft: string;
  pollMs?: number;
}) {
  const t = authCopy[locale];
  const { user, controller } = useSession();
  const [available, setAvailable] = useState(false);
  const [pending, setPending] = useState<Started | null>(null);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const verified = Boolean(user?.phone_verified_at);

  useEffect(() => {
    let active = true;
    controller
      .request<Availability>("/api/v1/me/phone-verification")
      .then((status) => {
        if (active) setAvailable(status.available);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [controller]);

  // While the user is in Telegram, re-read the account until the bot has verified the phone.
  useEffect(() => {
    if (!pending || verified) return;
    const deadline = Date.parse(pending.expires_at);
    const timer = setInterval(() => {
      if (Date.now() > deadline) {
        setPending(null);
        setExpired(true);
        return;
      }
      void controller.reloadUser().catch(() => undefined);
    }, pollMs);
    return () => clearInterval(timer);
  }, [pending, verified, controller, pollMs]);

  if (!user) return null;
  const saved = user.phone ?? "";
  const unsaved = (kazakhstanPhone(phoneDraft) ?? phoneDraft.trim()) !== saved;

  async function start() {
    setBusy(true);
    setError(null);
    setExpired(false);
    try {
      setPending(
        await controller.request<Started>("/api/v1/me/phone-verification", {
          method: "POST",
        }),
      );
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="phone-verification">
      <p>
        <span className="status-badge" data-tone={verified ? "success" : "warning"}>
          {verified ? t.phoneVerified : t.phoneUnverified}
        </span>
      </p>
      {!verified && saved && available ? (
        unsaved ? (
          <p className="field-hint">{noFinalDot(t.phoneSaveFirst)}</p>
        ) : pending ? (
          <>
            {/* A link, not window.open: browsers block windows opened after a request. */}
            <a
              className="action-link"
              href={pending.link}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t.openTelegram}
            </a>
            <Status>{t.waitingTelegram}</Status>
          </>
        ) : (
          <>
            <p className="field-hint">
              {expired ? t.telegramExpired : t.verifyTelegramHelp}
            </p>
            <button
              type="button"
              className="secondary"
              disabled={busy}
              onClick={() => void start()}
            >
              {t.verifyTelegram}
            </button>
          </>
        )
      ) : null}
      <FormError error={error} fields={{}} locale={locale} />
    </div>
  );
}
