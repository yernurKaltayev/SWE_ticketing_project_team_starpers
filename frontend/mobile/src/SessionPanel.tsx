import { useRef, useState } from "react";
import type { Locale } from "@biletflow/shared";
import { View } from "react-native";
import { authCopy } from "./auth-copy";
import { AuthError } from "./auth/Fields";
import { AuthForm } from "./auth/AuthForm";
import type { AuthParams, AuthScreenName } from "./navigation/auth-routes";
import { session, useSessionSnapshot } from "./session";
import { Action, Callout, Card, Heading, Muted, Pill, styles } from "./ui";

export default function SessionPanel({ locale, onNavigate, confirmDiscard }: {
  locale: Locale;
  confirmDiscard?: boolean;
  onNavigate: (screen: AuthScreenName, params?: AuthParams) => void;
}) {
  const t = authCopy[locale];
  const { user } = useSessionSnapshot();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [logoutIncomplete, setLogoutIncomplete] = useState(false);
  const inFlight = useRef(false);

  async function update(logout: boolean) {
    if (!session || inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setLogoutIncomplete(false);
    try {
      if (logout) await session.logout();
      else await session.reloadUser();
    } catch (caught) {
      if (logout) setLogoutIncomplete(true);
      else setError(caught);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  return (
    <View style={styles.stack}>
      {user ? (
        <>
          <Heading>{t.signedIn}</Heading>
          <Card>
            <Heading>{user.full_name}</Heading>
            <Muted>{user.email}</Muted>
            <Pill
              label={user.email_verified_at ? t.verified : t.unverified}
              tone={user.email_verified_at ? "success" : "warning"}
            />
          </Card>
          <Action title={busy ? t.working : t.refresh} disabled={busy} onPress={() => void update(false)} />
          <Action title={t.signOut} disabled={busy} onPress={() => void update(true)} />
        </>
      ) : (
        <AuthForm screen="Login" locale={locale} onNavigate={onNavigate} confirmDiscard={confirmDiscard} />
      )}
      <AuthError error={error} locale={locale} />
      {logoutIncomplete ? <Callout tone="warning">{t.logoutIncomplete}</Callout> : null}
    </View>
  );
}
