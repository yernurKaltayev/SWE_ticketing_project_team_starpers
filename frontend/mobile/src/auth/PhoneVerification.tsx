import { useEffect, useRef, useState } from "react";
import { AppState, Linking } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { kazakhstanPhone, noFinalDot } from "@biletflow/shared/features/auth/helpers";
import { useAuthedQuery } from "../data";
import { session } from "../session";
import { Action, Muted, Pill } from "../ui";
import { AuthError } from "./Fields";

type User = components["schemas"]["UserOut"];
type Started = components["schemas"]["PhoneVerificationStartOut"];
type Availability = components["schemas"]["PhoneVerificationStatusOut"];
const path = "/api/v1/me/phone-verification";

export function PhoneVerification({ locale, user, phoneDraft, disabled }: {
  locale: Locale;
  user: User;
  phoneDraft: string;
  disabled?: boolean;
}) {
  const t = authCopy[locale];
  const focused = useIsFocused();
  const verified = Boolean(user.phone_verified_at);
  const saved = user.phone ?? "";
  const unsaved = (kazakhstanPhone(phoneDraft) ?? phoneDraft.trim()) !== saved;
  const [pending, setPending] = useState<Started | null>(null);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const availability = useAuthedQuery<Availability>(["phone-verification", user.id], path, {
    enabled: focused && Boolean(saved) && !verified,
  });

  useEffect(() => {
    if (!pending || !focused || verified || unsaved || disabled || !session) return;
    const controller = session;
    const deadline = Date.parse(pending.expires_at);
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let running = false;

    async function refresh() {
      if (running || abort.signal.aborted || AppState.currentState !== "active") return;
      clearTimeout(timer);
      running = true;
      try {
        const snapshot = controller.getSnapshot();
        const profile = await controller.request<User>("/api/v1/me", { signal: abort.signal });
        if (abort.signal.aborted) return;
        if (controller.getSnapshot() === snapshot) {
          controller.updateUser(profile);
          if (profile.phone_verified_at) return;
        }
      } catch {
        if (abort.signal.aborted) return;
      } finally {
        running = false;
      }
      if (Date.now() >= deadline) {
        setPending(null);
        setExpired(true);
      } else {
        timer = setTimeout(() => void refresh(), 3000);
      }
    }

    const listener = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
      else clearTimeout(timer);
    });
    void refresh();
    return () => {
      abort.abort();
      clearTimeout(timer);
      listener.remove();
    };
  }, [disabled, focused, pending, verified, unsaved]);

  async function start() {
    if (!session || inFlight.current || disabled) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setExpired(false);
    try {
      setPending(await session.request<Started>(path, { method: "POST" }));
    } catch (caught) {
      setError(caught);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <>
      <Pill label={verified ? t.phoneVerified : t.phoneUnverified} tone={verified ? "success" : "warning"} />
      {!verified && saved && availability.isError ? (
        <>
          <AuthError error={availability.error} locale={locale} />
          <Action title={t.retry} onPress={() => void availability.refetch()} />
        </>
      ) : null}
      {!verified && saved && availability.data?.available ? (
        unsaved ? <Muted>{noFinalDot(t.phoneSaveFirst)}</Muted> : pending ? (
          <>
            <Action title={t.openTelegram} disabled={disabled}
              onPress={() => {
                setError(null);
                void Linking.openURL(pending.link).catch(setError);
              }} />
            <Muted live="polite">{t.waitingTelegram}</Muted>
          </>
        ) : (
          <>
            <Muted>{expired ? t.telegramExpired : t.verifyTelegramHelp}</Muted>
            <Action title={t.verifyTelegram} busy={busy} disabled={disabled || busy}
              onPress={() => void start()} />
          </>
        )
      ) : null}
      <AuthError error={error} locale={locale} />
    </>
  );
}
