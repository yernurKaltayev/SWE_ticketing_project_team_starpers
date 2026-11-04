import { createMemoryTokenStore } from "@biletflow/shared";
import type { TokenPair, TokenStore } from "@biletflow/shared";

export interface SecureStorage {
  getItemAsync(key: string): Promise<string | null>;
  setItemAsync(key: string, value: string): Promise<void>;
  deleteItemAsync(key: string): Promise<void>;
}
export interface NativeTokenStore extends TokenStore {
  getRefreshToken(): Promise<string | null>;
}
const key = "biletflow.refresh_token.v1";

/** Access tokens stay in memory; only the refresh credential uses OS secure storage. */
export function createNativeTokenStore(
  storage: SecureStorage,
): NativeTokenStore {
  const memory = createMemoryTokenStore();
  return {
    get: memory.get,
    getAccessToken: memory.getAccessToken,
    getRefreshToken: () => storage.getItemAsync(key),
    async set(tokens: TokenPair) {
      if (!tokens.accessToken || !tokens.refreshToken)
        throw new TypeError("Both tokens are required.");
      await storage.setItemAsync(key, tokens.refreshToken);
      await memory.set(tokens);
    },
    async clear() {
      await memory.clear();
      await storage.deleteItemAsync(key);
    },
  };
}
