import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const sharedSrc = join(dirname(fileURLToPath(import.meta.url)), "..", "src");

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return path.endsWith(".ts") ? [path] : [];
  });
}

/** Moved web logic, reachable as @biletflow/shared/features/<area>/<file>. */
const moved = [
  "calendar/copy",
  "calendar/model",
  "checkout/copy",
  "checkout/model",
  "seating/copy",
  "seating/model",
  "staff/model",
  "staff/copy",
  "auth/copy",
  "auth/helpers",
  "events/model",
  "events/categories",
  "events/discoveryCopy",
  "events/offerLabel",
  "events/contracts",
  "events/copy",
  "support/model",
  "support/copy",
  "payments/model",
  "payments/copy",
  "promotions/model",
  "promotions/copy",
  "operations/model",
  "operations/copy",
  "insights/model",
  "insights/copy",
];

describe("shared feature modules", () => {
  it.each(moved)("exposes %s through the package path", async (path) => {
    const mod: Record<string, unknown> = await import(`@biletflow/shared/features/${path}`);
    expect(Object.keys(mod).length).toBeGreaterThan(0);
  });

  it("keeps browser and React APIs out of shared", () => {
    const forbidden =
      /\b(document|window|localStorage|sessionStorage|navigator)\.|URL\.createObjectURL|import\.meta\.env|from "(react|react-dom|react-router-dom|@tanstack\/react-query)"|from "@biletflow\/shared|export default/;
    const offenders = sources(sharedSrc)
      .filter((file) => !file.endsWith(".d.ts"))
      .filter((file) => forbidden.test(readFileSync(file, "utf8")));
    expect(offenders).toEqual([]);
  });
});
