import * as SecureStore from "expo-secure-store";
import { createNativeTokenStore } from "./token-store";

export const tokenStore = createNativeTokenStore(SecureStore);

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
