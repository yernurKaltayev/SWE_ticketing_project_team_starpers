import type { KeyValueStore } from "@biletflow/shared";

/** The synchronous part of expo-secure-store that this adapter needs. */
export interface SyncSecureStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * SecureStore keys allow only letters, digits, ".", "-" and "_". Every other character,
 * including "_" itself, becomes "_<hex>_", so distinct keys never collide.
 */
export function secureKey(key: string): string {
  return key.replace(/[^A-Za-z0-9.-]/g, (char) => `_${char.charCodeAt(0).toString(16)}_`);
}

/**
 * SecureStore has no synchronous delete, so removal overwrites the value with "", which
 * reads back as missing. There is deliberately no background delete: one that lands after a
 * newer setItem for the same key would erase checkout recovery data.
 */
export function createSecureKeyValueStore(store: SyncSecureStore): KeyValueStore {
  return {
    getItem: (key) => store.getItem(secureKey(key)) || null,
    setItem: (key, value) => store.setItem(secureKey(key), value),
    removeItem: (key) => store.setItem(secureKey(key), ""),
  };
}
