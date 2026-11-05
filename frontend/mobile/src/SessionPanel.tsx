import { useEffect, useState, useSyncExternalStore } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useTheme } from "@react-navigation/native";
import { ApiError } from "@biletflow/shared";
import type { Locale, SessionSnapshot } from "@biletflow/shared";
import { authCopy } from "./auth-copy";
import { session } from "./session";

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
  const { colors, dark } = useTheme();
  const inputStyle = {
    color: colors.text,
    borderColor: dark ? "#87958e" : "#70837b",
    backgroundColor: colors.card,
  };
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
    <View style={styles.panel}>
      <Text
        accessibilityRole="header"
        style={[styles.title, { color: colors.text }]}
      >
        {snapshot.user ? t.signedIn : t.title}
      </Text>
      {!session ? (
        <Text style={[styles.body, { color: colors.text }]}>{t.config}</Text>
      ) : null}
      {snapshot.status === "loading" ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, { color: colors.text }]}
        >
          {t.checking}
        </Text>
      ) : snapshot.user ? (
        <>
          <Text style={[styles.body, { color: colors.text }]}>
            {snapshot.user.full_name}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {snapshot.user.email}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>
            {snapshot.user.email_verified_at ? t.verified : t.unverified}
          </Text>
          <Text style={[styles.body, { color: colors.text }]}>{t.next}</Text>
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
          <Text style={[styles.body, { color: colors.text }]}>
            {t.description}
          </Text>
          <Text
            nativeID="auth-email-label"
            style={[styles.label, { color: colors.text }]}
          >
            {t.email}
          </Text>
          <TextInput
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
            editable={!busy && Boolean(session)}
            style={[styles.input, inputStyle]}
          />
          <Text
            nativeID="auth-password-label"
            style={[styles.label, { color: colors.text }]}
          >
            {t.password}
          </Text>
          <TextInput
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
            style={[styles.input, inputStyle]}
          />
          <Action
            title={busy ? t.working : t.signIn}
            disabled={busy || !session}
            busy={busy}
            onPress={() => void signIn()}
          />
        </>
      )}
      {errorMessage ? (
        <Text
          accessibilityRole="alert"
          accessibilityLiveRegion="assertive"
          style={[styles.body, { color: colors.text }]}
        >
          {errorMessage}
          {error instanceof ApiError && error.requestId
            ? `\n${t.requestId}: ${error.requestId}`
            : ""}
        </Text>
      ) : null}
      {logoutIncomplete ? (
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, { color: colors.text }]}
        >
          {t.logoutIncomplete}
        </Text>
      ) : null}
    </View>
  );
}

function Action({
  title,
  disabled,
  busy,
  onPress,
}: {
  title: string;
  disabled: boolean;
  busy: boolean;
  onPress: () => void;
}) {
  const { colors, dark } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled, busy }}
      disabled={disabled}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={({ pressed }) => [
        styles.action,
        {
          backgroundColor: pressed && !disabled ? colors.border : colors.card,
          borderColor: focused ? colors.primary : dark ? "#87958e" : "#70837b",
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      <Text style={[styles.actionText, { color: colors.text }]}>{title}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  title: { fontSize: 26, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 26 },
  label: { fontSize: 17, fontWeight: "600", marginTop: 8 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderRadius: 5,
    padding: 12,
    fontSize: 17,
  },
  action: {
    minHeight: 48,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderRadius: 5,
    justifyContent: "center",
  },
  actionText: {
    fontSize: 17,
    lineHeight: 24,
    fontWeight: "600",
    textAlign: "center",
  },
});
