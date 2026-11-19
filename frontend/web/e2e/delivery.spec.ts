import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

// F11 cross-application smoke checks (mock mode, like the other specs).
// The production/nginx and real-API versions are in docs/F11_CHECKLIST.md.
const eventId = "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419";

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("public pages fit a 375px phone, keep the skip link and declare the locale", async ({
  page,
}) => {
  await page.setViewportSize({ width: 375, height: 800 });
  for (const path of ["/", "/events", `/events/${eventId}`, "/login", "/register"]) {
    await page.goto(path);
    await expect(page.locator("main#main")).toBeVisible();
    await noHorizontalScroll(page);
    await expect(page.locator("html")).toHaveAttribute("lang", "kk");
    // F1 moves focus to <main> on each route so screen readers start at the
    // content; the skip link remains for keyboard users coming from the header.
    await expect(page.locator("main#main")).toBeFocused();
    await expect(page.locator(".skip-link")).toHaveAttribute("href", "#main");
  }
  await page.locator(".language-control select").selectOption("ru");
  await expect(page.locator("html")).toHaveAttribute("lang", "ru");
});

test("event page offers calendar options and the .ics downloads", async ({ page }) => {
  await page.goto(`/events/${eventId}`);
  await page.locator(".language-control select").selectOption("en");
  const region = page.getByRole("region", { name: "Add to calendar" });
  await expect(region).toBeVisible();
  const google = region.getByRole("link", { name: /Google Calendar/ });
  await expect(google).toHaveAttribute("target", "_blank");
  expect(new URL((await google.getAttribute("href"))!).searchParams.get("ctz")).toBe(
    "Asia/Almaty",
  );
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    region.getByRole("button", { name: "Download .ics file" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/\.ics$/);
  // Refreshing a deep link serves the same page.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("a protected deep link returns to the requested page after sign-in", async ({
  page,
}) => {
  await page.goto("/account/tickets");
  await expect(page).toHaveURL(/\/login\?returnTo=%2Faccount%2Ftickets/);
  await page.locator(".language-control select").selectOption("en");
  await page.getByLabel("Email", { exact: true }).fill("attendee@example.com");
  await page.getByLabel("Password", { exact: true }).fill("BiletFlow123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/tickets$/);
  await expect(page.getByRole("heading", { name: "My tickets" })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 800 });
  await noHorizontalScroll(page);
});

test("unknown paths show the not-found page instead of a blank screen", async ({
  page,
}) => {
  await page.goto("/definitely/not/a/route");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: /home|Басты|Главная/i })).toBeVisible();
});
