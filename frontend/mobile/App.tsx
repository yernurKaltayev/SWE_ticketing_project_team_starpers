import { useEffect, useRef, useState } from "react";
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
  useTheme,
} from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
import { ApiError, localeLabels, locales, messages } from "@biletflow/shared";
import type { Locale } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { api, apiOrigin as origin, probeSecureStorage } from "./src/session";
import SessionPanel from "./src/SessionPanel";

type Screens = { Home: undefined; Connection: undefined };
const Stack = createNativeStackNavigator<Screens>();

export default function App() {
  const [locale, setLocale] = useState<Locale>("kk");
  const theme = useColorScheme() === "dark" ? DarkTheme : DefaultTheme;
  const t = messages[locale];
  return (
    <SafeAreaProvider>
      <NavigationContainer theme={theme}>
        <StatusBar style="auto" />
        <Stack.Navigator>
          <Stack.Screen
            name="Home"
            options={{ title: "BiletFlow Event Admin" }}
          >
            {(props: NativeStackScreenProps<Screens, "Home">) => (
              <SafeAreaView
                edges={["bottom", "left", "right"]}
                style={[
                  styles.fill,
                  { backgroundColor: theme.colors.background },
                ]}
              >
                <KeyboardAvoidingView
                  style={styles.fill}
                  behavior={Platform.OS === "ios" ? "padding" : undefined}
                >
                  <ScrollView
                    contentContainerStyle={styles.content}
                    keyboardShouldPersistTaps="handled"
                  >
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
                    <Text style={[styles.body, { color: theme.colors.text }]}>
                      {t.language}
                    </Text>
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
                    <View style={styles.button}>
                      <Button
                        title={t.checkApi}
                        onPress={() => props.navigation.navigate("Connection")}
                      />
                    </View>
                  </ScrollView>
                </KeyboardAvoidingView>
              </SafeAreaView>
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
