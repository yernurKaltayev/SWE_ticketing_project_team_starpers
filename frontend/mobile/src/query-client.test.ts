import { describe, expect, it } from "vitest";
import { appStateToFocus, clearQueries, createQueryClient, queryClient } from "./query-client";

describe("mobile query client", () => {
  it("uses one retry and a 30 s fresh window", () => {
    const queries = createQueryClient().getDefaultOptions().queries;
    expect(queries?.retry).toBe(1);
    expect(queries?.staleTime).toBe(30_000);
  });

  it("forgets every cached response when the session is cleared", () => {
    queryClient.setQueryData(["f3", "user-a", "/api/v1/me/tickets"], { items: [1] });
    clearQueries();
    expect(queryClient.getQueryData(["f3", "user-a", "/api/v1/me/tickets"])).toBeUndefined();
  });

  it("treats only an active app as focused", () => {
    expect(appStateToFocus("active")).toBe(true);
    expect(appStateToFocus("background")).toBe(false);
    expect(appStateToFocus("inactive")).toBe(false);
  });
});
