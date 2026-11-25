import { useEffect, useRef, useState } from "react";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { NavigationContainer, createNavigationContainerRef } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { StatusBar } from "expo-status-bar";
// Per-weight entry points: importing the package index would bundle all 18 Inter files.
import { useFonts } from "@expo-google-fonts/inter/useFonts";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { Inter_700Bold } from "@expo-google-fonts/inter/700Bold";
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
import { Brand, TabIcon } from "./src/icons";
import { TicketsScreen } from "./src/tickets/TicketsScreen";
import { TicketDetail } from "./src/tickets/TicketDetail";
import { ticketsCopy } from "./src/tickets/copy";
import { WebScreen } from "./src/web/WebScreen";
import { webCopy } from "./src/web/copy";
import { color, navigationTheme } from "./src/theme";
import {
  Action,
  Body,
  Card,
  HeaderAction,
  Heading,
  Label,
  Muted,
  Screen,
  Segmented,
  styles as ui,
  Title,
} from "./src/ui";

type Screens = {
  Tabs: undefined;
  TicketDetail: { ticketId: string; eventTitle: string | null };
  CheckIn: { eventId: string; title: string };
  Settings: undefined;
  Connection: undefined;
};
type TabScreens = { Web: undefined; Tickets: undefined; Home: undefined };
const Stack = createNativeStackNavigator<Screens>();
const Tab = createBottomTabNavigator<TabScreens>();
const navigation = createNavigationContainerRef<Screens>();

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const [locale, setLocale] = useState<Locale>("kk");
  const t = messages[locale];
  const c = checkInCopy[locale];
  const snapshot = useSessionSnapshot();
  const signedIn = snapshot.user !== null;

  // Sign-out or session expiry anywhere returns to the sign-in screen; nothing event-specific
  // stays on screen for the next person holding the phone.
  useEffect(() => {
    if (!signedIn && navigation.isReady() && !["Web", "Tickets", "Home"].includes(navigation.getCurrentRoute()?.name ?? ""))
      navigation.reset({ index: 0, routes: [{ name: "Tabs" }] });
  }, [signedIn]);

  // The bundled Inter files load in milliseconds; a failed load falls back to the system face.
  if (!fontsLoaded && !fontError) return null;

  const language = (
    <>
      <Label>{t.language}</Label>
      <Segmented
        kind="choice"
        value={locale}
        onChange={setLocale}
        options={locales.map((code) => ({ value: code, label: localeLabels[code] }))}
      />
    </>
  );

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme} ref={navigation}>
        <StatusBar style="dark" />
        <Stack.Navigator
          screenOptions={{
            headerTitle: () => <Brand />,
            headerTitleAlign: "left",
            headerTintColor: color.primary,
            headerStyle: { backgroundColor: color.surface },
            headerShadowVisible: true,
            headerBackButtonDisplayMode: "generic",
            contentStyle: { backgroundColor: color.canvas },
          }}
        >
          <Stack.Screen
            name="Tabs"
            options={({ navigation: nav }) => ({
              headerRight: () => <HeaderAction title={c.settings} onPress={() => nav.navigate("Settings")} />,
            })}
          >
            {() => (
              <Tab.Navigator
                screenOptions={{
                  headerShown: false,
                  tabBarActiveTintColor: color.primary,
                  tabBarInactiveTintColor: color.muted,
                  tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.line },
                }}
              >
                <Tab.Screen
                  name="Web"
                  options={{
                    title: webCopy[locale].tab,
                    tabBarIcon: ({ color: tint }) => <TabIcon glyph="web" tint={tint} />,
                  }}
                >
                  {() => <WebScreen locale={locale} />}
                </Tab.Screen>
                <Tab.Screen
                  name="Tickets"
                  options={{
                    title: ticketsCopy[locale].tab,
                    tabBarIcon: ({ color: tint }) => <TabIcon glyph="tickets" tint={tint} />,
                  }}
                >
                  {() =>
                    signedIn ? (
                      <SafeAreaView edges={["left", "right"]} style={ui.fill}>
                        <TicketsScreen
                          key={snapshot.user?.id}
                          locale={locale}
                          onOpen={(ticket, eventTitle) =>
                            navigation.navigate("TicketDetail", { ticketId: ticket.id, eventTitle })
                          }
                        />
                      </SafeAreaView>
                    ) : (
                      <Screen>
                  <SessionPanel locale={locale} />
                  {language}
                </Screen>
                    )
                  }
                </Tab.Screen>
                <Tab.Screen
                  name="Home"
                  options={{
                    title: c.tab,
                    tabBarIcon: ({ color: tint }) => <TabIcon glyph="scan" tint={tint} />,
                  }}
                >
                  {() =>
              signedIn ? (
                <SafeAreaView edges={["left", "right"]} style={ui.fill}>
                  <EventsScreen
                    key={snapshot.user?.id}
                    locale={locale}
                    onOpen={(event) =>
                      navigation.navigate("CheckIn", {
                        eventId: event.event_id,
                        title: event.title,
                      })
                    }
                  />
                </SafeAreaView>
              ) : (
                <Screen>
                  <SessionPanel locale={locale} />
                  {language}
                  <Card style={{ marginTop: 8 }}>
                    <Heading>{t.foundationTitle}</Heading>
                    <Muted>{t.foundationDescription}</Muted>
                    <Action
                      title={t.checkApi}
                      onPress={() => navigation.navigate("Connection")}
                    />
                  </Card>
                </Screen>
              )
            }
                </Tab.Screen>
              </Tab.Navigator>
            )}
          </Stack.Screen>
          <Stack.Screen name="TicketDetail">
            {(props: NativeStackScreenProps<Screens, "TicketDetail">) => (
              <TicketDetail
                key={`${snapshot.user?.id}:${props.route.params.ticketId}`}
                ticketId={props.route.params.ticketId}
                eventTitle={props.route.params.eventTitle}
                locale={locale}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="CheckIn">
            {(props: NativeStackScreenProps<Screens, "CheckIn">) => (
              <CheckInScreen
                key={`${snapshot.user?.id}:${props.route.params.eventId}`}
                eventId={props.route.params.eventId}
                title={props.route.params.title}
                locale={locale}
              />
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings">
            {(props: NativeStackScreenProps<Screens, "Settings">) => (
              <Screen>
                <Title>{c.settings}</Title>
                <SessionPanel locale={locale} />
                {language}
                <Action
                  title={c.connection}
                  onPress={() => props.navigation.navigate("Connection")}
                />
              </Screen>
            )}
          </Stack.Screen>
          <Stack.Screen name="Connection">{() => <Connection locale={locale} />}</Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

function Connection({ locale }: { locale: Locale }) {
  const t = messages[locale];
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
      const result = await api.request<components["schemas"]["HealthOut"]>("/health", {
        signal: controller.signal,
      });
      if (!controller.signal.aborted) setStatus(`${t.ready}: ${result.status} / ${result.database}`);
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus(`${t.unavailable}: ${error instanceof ApiError ? error.code : t.unknownError}`);
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <Screen>
      <Title subtitle={origin || "EXPO_PUBLIC_API_ORIGIN"}>{t.apiStatus}</Title>
      <Card>
        {!api ? <Body>{t.notChecked}: EXPO_PUBLIC_API_ORIGIN</Body> : null}
        <Body live="polite">{status || t.notChecked}</Body>
      </Card>
      <Action
        title={busy ? t.checking : t.checkApi}
        variant="primary"
        busy={busy}
        onPress={() => void check()}
        disabled={!api || busy}
      />
      {__DEV__ ? (
        <>
          <Action
            title="SecureStore · F0"
            onPress={() => {
              void probeSecureStorage()
                .then((ok) => setStorageStatus(ok ? t.ready : t.unavailable))
                .catch(() => setStorageStatus(t.unavailable));
            }}
          />
          {storageStatus ? <Muted live="polite">{storageStatus}</Muted> : null}
        </>
      ) : null}
    </Screen>
  );
}
