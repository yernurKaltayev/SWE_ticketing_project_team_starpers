/**
 * Small synchronous string store, structurally compatible with the browser `Storage`.
 * Web passes `localStorage`; mobile passes a SecureStore adapter. Shared code receives
 * it as a parameter and never reaches for a platform store itself.
 */
export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function createMemoryKeyValueStore(): KeyValueStore {
  const values = new Map<string, string>();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    removeItem: (key) => {
      values.delete(key);
    },
  };
}
