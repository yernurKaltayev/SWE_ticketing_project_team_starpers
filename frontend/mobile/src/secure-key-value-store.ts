import type { KeyValueStore } from "@biletflow/shared";

/** The synchronous part of expo-secure-store that this adapter needs. */
export interface SyncSecureStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  deleteItemAsync(key: string): Promise<void>;
}

/**
 * SecureStore keys allow only letters, digits, ".", "-" and "_". Every other character,
 * including "_" itself, becomes "_<hex>_", so distinct keys never collide.
 */
export function secureKey(key: string): string {
  return key.replace(/[^A-Za-z0-9.-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`);
}

/**
 * SecureStore has no synchronous delete: removal first overwrites the value with "",
 * which reads back as missing, then deletes in the background.
 */
export function createSecureKeyValueStore(store: SyncSecureStore): KeyValueStore {
  return {
    getItem: (key) => store.getItem(secureKey(key)) || null,
    setItem: (key, value) => store.setItem(secureKey(key), value),
    removeItem: (key) => {
      const encoded = secureKey(key);
      store.setItem(encoded, "");
      void store.deleteItemAsync(encoded).catch(() => undefined);
    },
  };
}
