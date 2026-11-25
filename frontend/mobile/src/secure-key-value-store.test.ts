import { describe, expect, it } from "vitest";
import { createSecureKeyValueStore, secureKey } from "./secure-key-value-store";
import type { SyncSecureStore } from "./secure-key-value-store";

function fakeStore() {
  const data = new Map<string, string>();
  const pendingDeletes: string[] = [];
  const store: SyncSecureStore = {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => {
      if (!/^[A-Za-z0-9._-]+$/.test(k)) throw new Error(`invalid key ${k}`);
      data.set(k, v);
    },
    // Never resolves during the test: removal must not depend on it.
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
  it("reads a removed key as missing before the async delete finishes", () => {
    const { store, pendingDeletes } = fakeStore();
    const kv = createSecureKeyValueStore(store);
    kv.setItem("a:b", "v");
    kv.removeItem("a:b");
    expect(kv.getItem("a:b")).toBeNull();
    expect(pendingDeletes).toEqual([secureKey("a:b")]);
  });
  it("treats an empty stored value as missing", () => {
    const { store, data } = fakeStore();
    data.set(secureKey("k"), "");
    expect(createSecureKeyValueStore(store).getItem("k")).toBeNull();
  });
});
