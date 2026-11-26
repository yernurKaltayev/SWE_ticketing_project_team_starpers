import type { ConfigContext, ExpoConfig } from "expo/config";

/** Expo Go uses exp://. Signed builds can opt into verified HTTPS links for the public site. */
export default function configure({ config }: ConfigContext): ExpoConfig {
  const { name, slug } = config;
  if (!name || !slug) throw new Error("Set the Expo app name and slug in app.json.");
  const iosBundle = process.env.BILETFLOW_IOS_BUNDLE_ID;
  const androidPackage = process.env.BILETFLOW_ANDROID_PACKAGE;
  const source = process.env.EXPO_PUBLIC_WEB_ORIGIN;
  let host: string | undefined;
  if (source) {
    try {
      const url = new URL(source);
      if (url.protocol === "https:" && source.replace(/\/$/, "") === url.origin && !url.port) {
        host = url.hostname;
      }
    } catch {
      // Local development may use HTTP and the Expo Go URL.
    }
  }
  const exact = ["/", "/login", "/register", "/verify-email", "/forgot-password", "/reset-password", "/tickets"];
  const prefixes = ["/events", "/account", "/orders", "/support", "/organizer", "/admin"];
  return {
    ...config,
    name,
    slug,
    ios: {
      ...config.ios,
      ...(iosBundle && { bundleIdentifier: iosBundle }),
      ...(iosBundle && host && { associatedDomains: [`applinks:${host}`] }),
    },
    android: {
      ...config.android,
      ...(androidPackage && { package: androidPackage }),
      ...(androidPackage && host && {
        intentFilters: [{
          action: "VIEW",
          autoVerify: true,
          category: ["BROWSABLE", "DEFAULT"],
          data: [
            ...exact.map((path) => ({ scheme: "https", host, path })),
            ...prefixes.map((pathPrefix) => ({ scheme: "https", host, pathPrefix })),
          ],
        }],
      }),
    },
  };
}
