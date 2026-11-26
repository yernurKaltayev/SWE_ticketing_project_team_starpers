import { label as insightLabel } from "@biletflow/shared/features/insights/copy";
import { paymentCopy } from "@biletflow/shared/features/payments/copy";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { authCopy } from "@biletflow/shared/features/auth/copy";
import { eventCopy } from "@biletflow/shared/features/events/copy";
import { Discovery } from "./src/events/Discovery";
import { authCopy as mobileAuthCopy } from "./src/auth-copy";
import { safeReturnTo } from "@biletflow/shared/features/auth/helpers";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./src/query-client";
import { bindAppFocus } from "./src/data";
import * as Linking from "expo-linking";
import { linkingConfig } from "./src/navigation/linking";
import type { NativeTarget } from "./src/navigation/routes";
import { navigationFor } from "./src/navigation/navigate";
import { featureNames } from "./src/navigation/features";
import { FeatureScreen } from "./src/features/FeatureScreen";
import { useUnreadCount } from "./src/support/Screens";
import { supportCopy } from "@biletflow/shared/features/support/copy";
import { commerceCopy } from "@biletflow/shared/features/checkout/copy";
import { authScreenNames } from "./src/navigation/auth-routes";
import type { AuthParams, AuthScreenName } from "./src/navigation/auth-routes";
import { nativeRouteFor } from "./src/navigation/routes";
import { AuthForm } from "./src/auth/AuthForm";
import { Profile } from "./src/auth/Profile";
import { webOrigin } from "./src/public-origin";
import { CommonActions, NavigationContainer, StackActions, createNavigationContainerRef, useIsFocused } from "@react-navigation/native";
import type { Screens, TabScreens } from "./src/navigation/params";
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
  session,
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
import { KitGallery } from "./src/kit/Gallery";
import { color, navigationTheme } from "./src/theme";
import {
  Action,
  Body,
  Card,
  Callout,
  HeaderAction,
  Heading,
  Label,
  Muted,
  Screen,
  Segmented,
  styles as ui,
  Title,
} from "./src/ui";

const Stack = createNativeStackNavigator<Screens>();
const Tab = createBottomTabNavigator<TabScreens>();
const linking = {
  prefixes: [Linking.createURL("/"), "biletflow://", ...(webOrigin?.startsWith("https://") ? [webOrigin] : [])],
  config: linkingConfig(),
};


const navigation = createNavigationContainerRef<Screens>();

/** Opens the native screen that replaces a web page (route map in src/navigation/routes.ts). */
function goNative(target: NativeTarget) {
  if (!navigation.isReady()) return;
  navigation.dispatch(CommonActions.navigate(navigationFor(target)));
}

function openPath(path: string) {
  const target = nativeRouteFor(path, webOrigin ?? "https://biletflow.invalid");
  if (target) goNative(target);
}

function openAuth(screen: AuthScreenName, params?: AuthParams) {
  if (navigation.isReady()) navigation.navigate(screen, params);
}

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

  useEffect(() => bindAppFocus(), []);

  useEffect(() => {
    void session?.initialize().catch(() => undefined);
  }, []);

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
    <QueryClientProvider client={queryClient}>
    <SafeAreaProvider>
      <NavigationContainer theme={navigationTheme} ref={navigation} linking={linking}>
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
                initialRouteName="Discover"
                screenOptions={{
                  headerShown: false,
                  tabBarActiveTintColor: color.primary,
                  tabBarInactiveTintColor: color.muted,
                  tabBarStyle: { backgroundColor: color.surface, borderTopColor: color.line },
                }}
              >
                <Tab.Screen
                  name="Discover"
                  options={{
                    title: eventCopy[locale].navEvents,
                    tabBarIcon: ({ color: tint }) => <TabIcon glyph="discover" tint={tint} />,
                  }}
                >
                  {({ route }) => (
                    <SafeAreaView edges={["left", "right"]} style={ui.fill}>
                      <Discovery key={JSON.stringify(route.params)} locale={locale} initial={route.params}
                        onOpen={(event) => openPath(`/events/${encodeURIComponent(event.id)}`)} />
                    </SafeAreaView>
                  )}
                </Tab.Screen>
                <Tab.Screen
                  name="Tickets"
                  options={{
                    title: ticketsCopy[locale].tab,
                    tabBarIcon: ({ color: tint }) => <TabIcon glyph="tickets" tint={tint} />,
                  }}
                >
                  {() => signedIn ? (
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
                      <SessionPanel locale={locale} onNavigate={openAuth} />
                      {language}
                    </Screen>
                  )}
                </Tab.Screen>
                <Tab.Screen
                  name="Home"
                  options={{
                    title: c.tab,
                    tabBarIcon: ({ color: tint }) => <TabIcon glyph="scan" tint={tint} />,
                  }}
                >
                  {() => signedIn ? (
                    <SafeAreaView edges={["left", "right"]} style={ui.fill}>
                      <EventsScreen
                        key={snapshot.user?.id}
                        locale={locale}
                        onOpen={(event) =>
                          navigation.navigate("CheckIn", { eventId: event.event_id, title: event.title })
                        }
                      />
                    </SafeAreaView>
                  ) : (
                    <Screen>
                      <SessionPanel locale={locale} onNavigate={openAuth} />
                      {language}
                      <Card style={{ marginTop: 8 }}>
                        <Heading>{t.foundationTitle}</Heading>
                        <Muted>{t.foundationDescription}</Muted>
                        <Action title={t.checkApi} onPress={() => navigation.navigate("Connection")} />
                      </Card>
                    </Screen>
                  )}
                </Tab.Screen>
                <Tab.Screen
                  name="Account"
                  options={{
                    title: authCopy[locale].account,
                    lazy: false,
                    tabBarIcon: ({ color: tint }) => <TabIcon glyph="account" tint={tint} />,
                  }}
                >
                  {({ navigation: tabNav }) => <AccountScreen locale={locale} tabNav={tabNav} />}
                </Tab.Screen>
              </Tab.Navigator>
            )}
          </Stack.Screen>
          {authScreenNames.map((name) => (
            <Stack.Screen name={name} key={name}>
              {(props) => <AuthRoute {...props} locale={locale} />}
            </Stack.Screen>
          ))}
          {featureNames.map((name) => (
            <Stack.Screen name={name} key={name}>
              {({ route }) => <FeatureScreen name={name} params={route.params}
                key={`${snapshot.user?.id}:${JSON.stringify(route.params)}`} locale={locale} open={openPath} openAuth={openAuth} />}
            </Stack.Screen>
          ))}
          <Stack.Screen name="TicketDetail">
            {(props: NativeStackScreenProps<Screens, "TicketDetail">) =>
              // A deep link can arrive signed out: offer sign-in; the key reloads it afterwards.
              signedIn ? (
                <TicketDetail
                  key={`${snapshot.user?.id}:${props.route.params.ticketId}`}
                  ticketId={props.route.params.ticketId}
                  eventTitle={props.route.params.eventTitle ?? null}
                  locale={locale}
                />
              ) : (
                <Screen>
                  <SessionPanel locale={locale} onNavigate={openAuth} confirmDiscard />
                </Screen>
              )
            }
          </Stack.Screen>
          <Stack.Screen name="CheckIn">
            {(props: NativeStackScreenProps<Screens, "CheckIn">) => signedIn ? (
              <CheckInScreen
                key={`${snapshot.user?.id}:${props.route.params.eventId}`}
                eventId={props.route.params.eventId}
                title={props.route.params.title}
                locale={locale}
              />
            ) : (
              <Screen><SessionPanel locale={locale} onNavigate={openAuth} confirmDiscard /></Screen>
            )}
          </Stack.Screen>
          <Stack.Screen name="Settings">
            {(props: NativeStackScreenProps<Screens, "Settings">) => (
              <Screen>
                <Title>{c.settings}</Title>
                <SessionPanel locale={locale} onNavigate={openAuth} confirmDiscard />
                {language}
                <Action
                  title={c.connection}
                  onPress={() => props.navigation.navigate("Connection")}
                />
                {__DEV__ ? (
                  <Action title="UI kit" onPress={() => props.navigation.navigate("KitGallery")} />
                ) : null}
              </Screen>
            )}
          </Stack.Screen>
          {__DEV__ ? (
            <Stack.Screen name="KitGallery">
              {() => (
                <SafeAreaView edges={["bottom", "left", "right"]} style={ui.fill}>
                  <KitGallery locale={locale} />
                </SafeAreaView>
              )}
            </Stack.Screen>
          ) : null}
          <Stack.Screen name="Connection">{() => <Connection locale={locale} />}</Stack.Screen>
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
    </QueryClientProvider>
  );
}

function AuthRoute({
  route,
  navigation: nav,
  locale,
}: NativeStackScreenProps<Screens, AuthScreenName> & { locale: Locale }) {
  const { user } = useSessionSnapshot();
  const { name, params } = route;
  const focused = useIsFocused();
  useEffect(() => {
    if (!user || (name !== "Login" && name !== "Register") || !focused) return;
    const target = params?.returnTo
      ? nativeRouteFor(safeReturnTo(params.returnTo), webOrigin ?? "https://biletflow.invalid")
      : null;
    const next = target ? navigationFor(target) : null;
    if (next?.name === "TicketDetail") {
      nav.replace("TicketDetail", next.params);
    } else if (next?.name === "Tabs") {
      nav.popTo("Tabs", next.params);
    } else if (next && !authScreenNames.some((screen) => screen === next.name)) {
      nav.dispatch(StackActions.replace(next.name, next.params));
    } else if (nav.canGoBack()) {
      nav.goBack();
    } else {
      nav.replace("Tabs");
    }
  }, [focused, name, nav, params?.returnTo, user]);
  return (
    <Screen>
      <AuthForm key={name + (params?.token ?? "")} screen={name} params={params} locale={locale}
        confirmDiscard onNavigate={(screen, next) => nav.replace(screen, next)} />
    </Screen>
  );
}

function AccountScreen({ locale, tabNav }: { locale: Locale; tabNav: {
  setOptions: (options: { tabBarBadge?: number }) => void;
} }) {
  const { user } = useSessionSnapshot();
  const unread = useUnreadCount();
  useLayoutEffect(() => tabNav.setOptions({ tabBarBadge: unread || undefined }), [tabNav, unread]);
  const [logoutIncomplete, setLogoutIncomplete] = useState(false);
  return (
    <Screen>
      {user ? (
        <>
        <Action title={supportCopy[locale].notifications} onPress={() => openPath("/account/notifications")} />
        <Action title={commerceCopy[locale].orders} onPress={() => openPath("/account/orders")} />
        <Action title={supportCopy[locale].title} onPress={() => openPath("/support")} />
        {user.role === "organizer" ? <>
          <Action title={eventCopy[locale].organizer} onPress={() => openPath("/organizer/events")} />
          <Action title={authCopy[locale].organizer} onPress={() => openPath("/organizer/profile")} />
          <Action title={paymentCopy[locale].accounts} onPress={() => openPath("/organizer/payout-accounts")} />
          <Action title={paymentCopy[locale].payouts} onPress={() => openPath("/organizer/payouts")} />
        </> : null}
        {user.role === "platform_admin" ? <Action title={insightLabel(locale, "admin")} onPress={() => openPath("/admin")} /> : null}
        <Profile key={user.id} locale={locale} user={user}
          onVerifyEmail={() => openAuth("VerifyEmail", { email: user.email, returnTo: "/account" })}
          onLogout={async () => {
            setLogoutIncomplete(false);
            await session?.logout().catch(() => setLogoutIncomplete(true));
          }} />
        </>
      ) : <AuthForm screen="Login" locale={locale} onNavigate={openAuth} />}
      {logoutIncomplete && !user ? <Callout tone="warning">{mobileAuthCopy[locale].logoutIncomplete}</Callout> : null}
    </Screen>
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
