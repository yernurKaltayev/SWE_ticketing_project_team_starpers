// @vitest-environment jsdom
import { expect, it } from "vitest";
import { loadCampaignTypes } from "./data";
import {
  mockCheckoutEvent,
  resetEventMocks,
  demoEventId,
} from "../mocks/events";
import type { Request } from "./model";
it("collects all paginated eligibility choices rather than only the first 100", async () => {
  resetEventMocks();
  const template = mockCheckoutEvent(demoEventId)!.tickets[0]!;
  const paths: string[] = [];
  const request: Request = async <T>(path: string) => {
    paths.push(path);
    const offset = Number(
      new URL(path, "http://localhost").searchParams.get("offset"),
    );
    return {
      items: Array.from({ length: offset === 0 ? 100 : 1 }, (_, i) => ({
        ...template,
        id: String(offset + i),
      })),
      total: 101,
      limit: 100,
      offset,
    } as T;
  };
  expect((await loadCampaignTypes(request, "/types")).items).toHaveLength(101);
  expect(paths).toEqual([
    "/types?limit=100&offset=0",
    "/types?limit=100&offset=100",
  ]);
});
it("accepts complete live P3 arrays and rejects nonadvancing pages", async () => {
  resetEventMocks();
  const template = mockCheckoutEvent(demoEventId)!.tickets[0]!;
  const array: Request = async <T>() => [template] as T;
  expect((await loadCampaignTypes(array, "/types")).items).toHaveLength(1);
  const malformed: Request = async <T>() =>
    ({ items: [], total: 1, limit: 100, offset: 0 }) as T;
  await expect(loadCampaignTypes(malformed, "/types")).rejects.toThrow(
    "invalid_ticket_types",
  );
});
