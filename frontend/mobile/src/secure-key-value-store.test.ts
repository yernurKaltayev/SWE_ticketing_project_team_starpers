import { describe, expect, it } from "vitest";
import { createSecureKeyValueStore, secureKey } from "./secure-key-value-store";
import type { SyncSecureStore } from "./secure-key-value-store";

function fakeStore() {
  const data = new Map<string, string>();
  const pendingDeletes: string[] = [];
  const store: SyncSecureStore & { deleteItemAsync(k: string): Promise<void> } = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`);
      data.set(k, v);
    },
    // Present on the real SecureStore; removal must not use it.
    deleteItemAsync: (k) => {
      pendingDeletes.push(k);
      return new Promise(() => undefined);
    },
  };
  return { store, data, pendingDeletes };
}

describe("secureKey", () => {
  it("only produces characters SecureStore accepts", () => {
    expect(secureKey("biletflow:f3:attempt:u%201:e/1")).toMatch(/^[A-Za-z0-9._-]+$/);
  });
  it("does not let different keys collide", () => {
    const a = secureKey("a:b");
    expect(a).not.toBe(secureKey("a_b"));
    expect(a).not.toBe(secureKey("a_3ab"));
    expect(secureKey("a_b")).not.toBe(secureKey("a_3ab"));
  });
  it("is stable", () => {
    expect(secureKey("x:y")).toBe(secureKey("x:y"));
  });
});

describe("createSecureKeyValueStore", () => {
  it("stores and reads values under encoded keys", () => {
    const { store } = fakeStore();
    const kv = createSecureKeyValueStore(store);
    kv.setItem("biletflow:f3:attempt:u:e", "v");
    expect(kv.getItem("biletflow:f3:attempt:u:e")).toBe("v");
  });
  it("reads a removed key as missing without any native delete", () => {
    const { store, pendingDeletes } = fakeStore();
    const kv = createSecureKeyValueStore(store);
    kv.setItem("a:b", "v");
    kv.removeItem("a:b");
    expect(kv.getItem("a:b")).toBeNull();
    expect(pendingDeletes).toEqual([]);
  });
  it("treats an empty stored value as missing", () => {
    const { store, data } = fakeStore();
    data.set(secureKey("k"), "");
    expect(createSecureKeyValueStore(store).getItem("k")).toBeNull();
  });
});

describe("removal without a background delete", () => {
  it("never lets a late native delete erase a newer value", async () => {
    let releaseDelete!: () => void;
    const data = new Map<string, string>();
    const store: SyncSecureStore & { deleteItemAsync(k: string): Promise<void> } = {
      getItem: (k) => data.get(k) ?? null,
      setItem: (k, v) => {
        data.set(k, v);
      },
      deleteItemAsync: (k) =>
        new Promise((resolve) => {
          releaseDelete = () => {
            data.delete(k);
            resolve();
          };
        }),
    };
    const kv = createSecureKeyValueStore(store);
    kv.setItem("attempt", "old");
    kv.removeItem("attempt");
    kv.setItem("attempt", "new");
    releaseDelete?.();
    await Promise.resolve();
    expect(kv.getItem("attempt")).toBe("new");
  });
});
