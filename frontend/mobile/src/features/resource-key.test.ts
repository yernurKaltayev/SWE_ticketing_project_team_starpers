import { describe, expect, it } from "vitest";
import { resourceKey } from "./resource-key";

const asList = (raw: unknown) => raw as unknown[];
const asSummary = (raw: unknown) => ({ choices: raw as unknown[] });

describe("resourceKey", () => {
  it("never shares a cache entry between two parsers of the same URL", () => {
    const path = "/api/v1/events/e1/availability";
    expect(resourceKey("u1", path, asList)).not.toEqual(resourceKey("u1", path, asSummary));
  });
  it("reuses the entry for the same parser, user and URL", () => {
    expect(resourceKey("u1", "/a", asList)).toEqual(resourceKey("u1", "/a", asList));
  });
  it("separates users and URLs", () => {
    expect(resourceKey("u1", "/a", asList)).not.toEqual(resourceKey("u2", "/a", asList));
    expect(resourceKey("u1", "/a", asList)).not.toEqual(resourceKey("u1", "/b", asList));
  });
});
