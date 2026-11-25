import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Linking, Platform, StyleSheet, View } from "react-native";
import { useIsFocused } from "@react-navigation/native";
import { WebView } from "react-native-webview";
import type { Locale } from "@biletflow/shared";
import { color } from "../theme";
import { Action, Callout, Screen } from "../ui";
import { webCopy } from "./copy";
import { isInternal, webOrigin } from "./model";

// The package's default generic (P = undefined) collapses its props to never under strict TS.
const BrowserView = WebView<object>;
type BrowserView = WebView<object>;

/**
 * The full BiletFlow web app inside the mobile app, for every screen that has no native
 * version yet. It keeps its own cookie session; links to other sites open in the browser.
 */
export function WebScreen({ locale }: { locale: Locale }) {
  const t = webCopy[locale];
  const focused = useIsFocused();
  const web = useRef<BrowserView>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Android back walks the web history first, only while this tab is on screen.
  useEffect(() => {
    if (!focused || Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!canGoBack) return false;
      web.current?.goBack();
      return true;
    });
    return () => sub.remove();
  }, [focused, canGoBack]);

  const reload = useCallback(() => {
    setFailed(false);
    setAttempt((n) => n + 1);
  }, []);

  if (!webOrigin)
    return (
      <Screen>
        <Callout tone="danger" alert>
          {t.notConfigured}
        </Callout>
      </Screen>
    );

  if (failed)
    return (
      <Screen>
        <Callout tone="danger" alert>
          {t.failed}
        </Callout>
        <Action title={t.reload} variant="primary" onPress={reload} />
      </Screen>
    );

  const origin = webOrigin;
  return (
    <View style={local.fill}>
      <BrowserView
        key={attempt}
        ref={web}
        source={{ uri: origin }}
        style={local.fill}
        sharedCookiesEnabled
        domStorageEnabled
        pullToRefreshEnabled
        allowsBackForwardNavigationGestures
        setSupportMultipleWindows={false}
        startInLoadingState
        onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
        onShouldStartLoadWithRequest={(request) => {
          if (isInternal(request.url, origin)) return true;
          void Linking.openURL(request.url).catch(() => undefined);
          return false;
        }}
        onError={() => setFailed(true)}
        onHttpError={(event) => {
          // Only a failed top-level page is fatal; API errors are shown by the web app itself.
          if (event.nativeEvent.url.replace(/\/$/, "") === origin && event.nativeEvent.statusCode >= 500)
            setFailed(true);
        }}
      />
    </View>
  );
}

const local = StyleSheet.create({
  fill: { flex: 1, backgroundColor: color.canvas },
});
