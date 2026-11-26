import { describe, expect, it } from "vitest";
import { createMemoryKeyValueStore } from "@biletflow/shared";

describe("createMemoryKeyValueStore", () => {
  it("stores, reads and removes values", () => {
    const store = createMemoryKeyValueStore();
    expect(store.getItem("missing")).toBeNull();
    store.setItem("k", "v");
    expect(store.getItem("k")).toBe("v");
    store.removeItem("k");
    expect(store.getItem("k")).toBeNull();
  });
});
