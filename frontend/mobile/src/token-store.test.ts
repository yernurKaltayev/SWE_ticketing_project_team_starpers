import { describe, expect, it } from "vitest";
import { createNativeTokenStore } from "./token-store";

function storage() {
  const values = new Map<string, string>();
  return {
    values,
    async getItemAsync(key: string) {
      return values.get(key) ?? null;
    },
    async setItemAsync(key: string, value: string) {
      values.set(key, value);
    },
    async deleteItemAsync(key: string) {
      values.delete(key);
    },
  };
}
describe("native session boundary", () => {
  it("persists only the refresh credential and requires refresh after a new process", async () => {
    const secure = storage();
    const store = createNativeTokenStore(secure);
    await store.set({
      accessToken: "access-demo",
      refreshToken: "refresh-demo",
    });
    expect([...secure.values.values()]).toEqual(["refresh-demo"]);
    expect(await store.getAccessToken()).toBe("access-demo");
    const restarted = createNativeTokenStore(secure);
    expect(await restarted.getAccessToken()).toBeNull();
    expect(await restarted.getRefreshToken()).toBe("refresh-demo");
    await store.clear();
    expect(await store.get()).toBeNull();
    expect(secure.values.size).toBe(0);
  });
  it("does not establish a session when secure persistence fails", async () => {
    const secure = storage();
    const store = createNativeTokenStore({
      ...secure,
      async setItemAsync() {
        throw new Error("locked");
      },
    });
    await expect(
      store.set({ accessToken: "a", refreshToken: "r" }),
    ).rejects.toThrow("locked");
    expect(await store.getAccessToken()).toBeNull();
  });
});
