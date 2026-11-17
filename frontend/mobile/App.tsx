import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Button,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
  createNavigationContainerRef,
  useTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ApiError, localeLabels, locales, messages } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import {
  api,
  apiOrigin as origin,
  probeSecureStorage,
  useSessionSnapshot,
} from "./src/session";
import SessionPanel from "./src/SessionPanel";
import { CheckInScreen } from "./src/checkin/CheckInScreen";
import { EventsScreen } from "./src/checkin/EventsScreen";
import { checkInCopy } from "./src/checkin/copy";

type Screens = {
  Home: undefined;
  CheckIn: { eventId: string; title: string };
  Settings: undefined;
  Connection: undefined;
};
const Stack = createNativeStackNavigator<Screens>();
const navigation = createNavigationContainerRef<Screens>();

export default function App() {
  const [locale, setLocale] = useState<Locale>("kk");
  const theme = useColorScheme() === "dark" ? DarkTheme : DefaultTheme;
  const t = messages[locale];
  const c = checkInCopy[locale];
  const snapshot = useSessionSnapshot();
  const signedIn = snapshot.user !== null;

  // Sign-out or session expiry anywhere returns to the sign-in screen; nothing event-specific
  // stays on screen for the next person holding the phone.
  useEffect(() => {
    if (!signedIn && navigation.isReady() && navigation.getCurrentRoute()?.name !== "Home")
      navigation.reset({ index: 0, routes: [{ name: "Home" }] });
  }, [signedIn]);

  const languageButtons = (
    <>
      <Text style={[styles.body, { color: theme.colors.text }]}>{t.language}</Text>
      {locales.map((code) => (
        <View key={code} style={styles.button}>
          <Button
            title={localeLabels[code]}
            accessibilityLabel={localeLabels[code]}
            onPress={() => setLocale(code)}
            disabled={locale === code}
          />
        </View>
      ))}
    </>
  );

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme} ref={navigation}>
        <StatusBar style="auto" />
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            options={({ navigation: nav }) => ({
              title: "BiletFlow Event Admin",
              headerRight: signedIn
                ? () => (
                    <Button title={c.settings} onPress={() => nav.navigate("Settings")} />
                  )
                : undefined,
            })}
          >
            {(props: NativeStackScreenProps<Screens, "Home">) =>
              signedIn ? (
                <SafeAreaView
                  edges={["bottom", "left", "right"]}
                  style={[styles.fill, { backgroundColor: theme.colors.background }]}
                >
                  <EventsScreen
                    key={snapshot.user?.id}
                    locale={locale}
                    onOpen={(event) =>
                      props.navigation.navigate("CheckIn", {
                        eventId: event.event_id,
                        title: event.title,
                      })
                    }
                  />
                </SafeAreaView>
              ) : (
                <Page background={theme.colors.background}>
                  <SessionPanel locale={locale} />
                  <Text
                    accessibilityRole="header"
                    style={[styles.title, { color: theme.colors.text }]}
                  >
                    {t.foundationTitle}
                  </Text>
                  <Text style={[styles.body, { color: theme.colors.text }]}>
                    {t.foundationDescription}
                  </Text>
                  {languageButtons}
                  <View style={styles.button}>
                    <Button
                      title={t.checkApi}
                      onPress={() => props.navigation.navigate("Connection")}
                    />
                  </View>
                </Page>
              )
            }
          </Stack.Screen>
          <Stack.Screen
            name="CheckIn"
            options={({ route }) => ({ title: route.params.title })}
          >
            {(props: NativeStackScreenProps<Screens, "CheckIn">) => (
              <CheckInScreen
                key={`${snapshot.user?.id}:${props.route.params.eventId}`}
                eventId={props.route.params.eventId}
                locale={locale}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings" options={{ title: c.settings }}>
            {(props: NativeStackScreenProps<Screens, "Settings">) => (
              <Page background={theme.colors.background}>
                <SessionPanel locale={locale} />
                {languageButtons}
                <View style={styles.button}>
                  <Button
                    title={c.connection}
                    onPress={() => props.navigation.navigate("Connection")}
                  />
                </View>
              </Page>
            )}
          </Stack.Screen>
          <Stack.Screen name="Connection" options={{ title: t.apiStatus }}>
            {() => <Connection locale={locale} />}
          </Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function Page({ background, children }: { background: string; children: ReactNode }) {
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.fill, { backgroundColor: background }]}
    >
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Connection({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const { colors } = useTheme();
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [storageStatus, setStorageStatus] = useState("");
  const active = useRef<AbortController | null>(null);
  useEffect(() => () => active.current?.abort(), []);
  async function check() {
    if (!api) return;
    active.current?.abort();
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setStatus(t.checking);
    try {
      const result = await api.request<components["schemas"]["HealthOut"]>(
        "/health",
        { signal: controller.signal },
      );
      if (!controller.signal.aborted)
        setStatus(`${t.ready}: ${result.status} / ${result.database}`);
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus(
          `${t.unavailable}: ${error instanceof ApiError ? error.code : t.unknownError}`,
        );
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <SafeAreaView
      edges={["bottom", "left", "right"]}
      style={[styles.fill, { backgroundColor: colors.background }]}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <Text
          accessibilityRole="header"
          style={[styles.title, { color: colors.text }]}
        >
          {t.apiStatus}
        </Text>
        <Text style={[styles.body, { color: colors.text }]}>
          {origin || "EXPO_PUBLIC_API_ORIGIN"}
        </Text>
        {!api ? (
          <Text style={[styles.body, { color: colors.text }]}>
            {t.notChecked}: EXPO_PUBLIC_API_ORIGIN
          </Text>
        ) : null}
        <View style={styles.button}>
          <Button
            title={busy ? t.checking : t.checkApi}
            onPress={() => void check()}
            disabled={!api || busy}
          />
        </View>
        <Text
          accessibilityLiveRegion="polite"
          style={[styles.body, { color: colors.text }]}
        >
          {status || t.notChecked}
        </Text>
        {__DEV__ ? (
          <>
            <View style={styles.button}>
              <Button
                title="SecureStore · F0"
                onPress={() => {
                  void probeSecureStorage()
                    .then((ok) =>
                      setStorageStatus(ok ? t.ready : t.unavailable),
                    )
                    .catch(() => setStorageStatus(t.unavailable));
                }}
              />
            </View>
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.body, { color: colors.text }]}
            >
              {storageStatus}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { padding: 24, gap: 16 },
  title: { fontSize: 26, fontWeight: "600" },
  body: { fontSize: 17, lineHeight: 26 },
  button: { minHeight: 48, justifyContent: "center", paddingVertical: 4 },
});
