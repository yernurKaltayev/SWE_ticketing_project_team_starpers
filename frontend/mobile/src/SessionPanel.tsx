import { useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { ApiError } from "@biletflow/shared";
import type { Locale, SessionSnapshot } from "@biletflow/shared";
import { authCopy } from "./auth-copy";
import { session } from "./session";
import { color, type } from "./theme";
import {
  Action,
  Callout,
  Card,
  Heading,
  Input,
  Label,
  Muted,
  Pill,
  styles as ui,
  Title,
} from "./ui";

const noSession: SessionSnapshot = {
  status: "signedOut",
  user: null,
  reason: null,
};
const subscribe = (listener: () => void) =>
  session?.subscribe(listener) ?? (() => undefined);
const getSnapshot = () => session?.getSnapshot() ?? noSession;

export default function SessionPanel({ locale }: { locale: Locale }) {
  const t = authCopy[locale];
  const snapshot = useSyncExternalStore(subscribe, getSnapshot);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [inputInvalid, setInputInvalid] = useState(false);
  const [logoutIncomplete, setLogoutIncomplete] = useState(false);
  useEffect(() => {
    void session?.initialize().catch(setError);
  }, []);

  const errorCode = error instanceof ApiError ? error.code : "";
  const errorMessage = inputInvalid
    ? t.invalidInput
    : errorCode === "invalid_credentials"
      ? t.invalidCredentials
      : errorCode === "email_not_verified"
        ? t.emailNotVerified
        : errorCode === "account_suspended" || snapshot.reason === "suspended"
          ? t.suspended
          : errorCode === "network_error"
            ? t.network
            : error instanceof ApiError && error.status === 429
              ? t.rateLimited
              : error instanceof ApiError && error.status === 403
                ? t.denied
                : snapshot.reason === "expired"
                  ? t.expired
                  : error
                    ? t.unavailable
                    : "";
  async function signIn() {
    if (!session || busy) return;
    setError(null);
    setLogoutIncomplete(false);
    const invalid =
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()) || !password;
    setInputInvalid(invalid);
    if (invalid) return;
    setBusy(true);
    try {
      await session.login({ email: email.trim(), password });
      setPassword("");
    } catch (failure) {
      setError(failure);
      setPassword("");
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    if (!session || busy) return;
    setBusy(true);
    setError(null);
    setPassword("");
    try {
      await session.logout();
    } catch {
      setLogoutIncomplete(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={ui.stack}>
      {snapshot.user ? (
        <Heading>{t.signedIn}</Heading>
      ) : (
        <Title subtitle={session ? t.description : undefined}>{t.title}</Title>
      )}
      {!session ? <Callout tone="warning">{t.config}</Callout> : null}
      {snapshot.status === "loading" ? (
        <Muted live="polite">{t.checking}</Muted>
      ) : snapshot.user ? (
        <>
          <Card>
            <Text style={styles.name}>{snapshot.user.full_name}</Text>
            <Muted>{snapshot.user.email}</Muted>
            <Pill
              label={snapshot.user.email_verified_at ? t.verified : t.unverified}
              tone={snapshot.user.email_verified_at ? "success" : "warning"}
            />
            <Muted>{t.next}</Muted>
          </Card>
          <Action
            title={busy ? t.working : t.refresh}
            disabled={busy}
            busy={busy}
            onPress={() => {
              if (!session || busy) return;
              setBusy(true);
              setError(null);
              void session
                .reloadUser()
                .catch(setError)
                .finally(() => setBusy(false));
            }}
          />
          <Action
            title={t.signOut}
            disabled={busy}
            busy={busy}
            onPress={() => void signOut()}
          />
        </>
      ) : (
        <>
          <Label nativeID="auth-email-label">{t.email}</Label>
          <Input
            accessibilityLabel={t.email}
            accessibilityLabelledBy="auth-email-label"
            value={email}
            onChangeText={setEmail}
            inputMode="email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="username"
            placeholder="staff@example.com"
            editable={!busy && Boolean(session)}
          />
          <Label nativeID="auth-password-label">{t.password}</Label>
          <Input
            accessibilityLabel={t.password}
            accessibilityLabelledBy="auth-password-label"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="current-password"
            textContentType="password"
            maxLength={128}
            editable={!busy && Boolean(session)}
            returnKeyType="go"
            onSubmitEditing={() => void signIn()}
          />
          <Action
            title={busy ? t.working : t.signIn}
            variant="primary"
            disabled={busy || !session}
            busy={busy}
            onPress={() => void signIn()}
          />
        </>
      )}
      {errorMessage ? (
        <Callout tone="danger" alert>
          <Text style={ui.body}>{errorMessage}</Text>
          {error instanceof ApiError && error.requestId ? (
            <Muted>
              {t.requestId}: {error.requestId}
            </Muted>
          ) : null}
        </Callout>
      ) : null}
      {logoutIncomplete ? <Callout tone="warning">{t.logoutIncomplete}</Callout> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  name: { ...type.heading, color: color.ink },
});
