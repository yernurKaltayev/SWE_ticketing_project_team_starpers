import * as SecureStore from "expo-secure-store";
import { createApiClient, createSession } from "@biletflow/shared";
import type { ApiClient, Session } from "@biletflow/shared";
import { createNativeTokenStore } from "./token-store";

export const tokenStore = createNativeTokenStore(SecureStore);
export const apiOrigin = process.env.EXPO_PUBLIC_API_ORIGIN;
export let api: ApiClient | null = null;
export let session: Session | null = null;
try {
  if (apiOrigin) {
    const parsed = new URL(apiOrigin);
    if (parsed.origin !== apiOrigin.replace(/\/$/, "")) {
      throw new TypeError("EXPO_PUBLIC_API_ORIGIN must be an API origin.");
    }
    api = createApiClient({ baseUrl: apiOrigin });
    session = createSession({
      baseUrl: apiOrigin,
      tokenStore,
      readRefreshToken: tokenStore.getRefreshToken,
    });
  }
} catch {
  // Invalid configuration stays visible in the connection and sign-in screens.
  api = null;
  session = null;
}

/** Dev-only probe uses a separate key and never overwrites a session credential. */
export async function probeSecureStorage(): Promise<boolean> {
  const key = "biletflow.f0.probe.v1";
  const value = `f0-${Date.now()}`;
  try {
    await SecureStore.setItemAsync(key, value);
    return (await SecureStore.getItemAsync(key)) === value;
  } finally {
    await SecureStore.deleteItemAsync(key);
  }
}
