import { test, expect } from "@playwright/test";
test("F5 demo supports keyboard selection, confirmed hold, release and narrow layouts", async ({
  page,
}) => {
  await page.goto("/dev/seating");
  await page.locator(".language-control select").selectOption("en");
  await page.getByLabel("Email", { exact: true }).fill("organizer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("BiletFlow123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("group", { name: "Seat map" })).toBeVisible();
  await page.getByLabel("Ticket type").selectOption("standard");
  const seat = page.getByRole("button", {
    name: "Parterre / A / 1: Available",
    exact: true,
  });
  await seat.focus();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("button", { name: "Hold selected seats (1)" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Hold selected seats (1)" }).click();
  await expect(
    page.getByRole("button", { name: "Continue with held seats" }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Release seats", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Release seats", exact: true }),
  ).toHaveCount(0);
  for (const locale of ["en", "ru", "kk"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".language-control select").selectOption(locale);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
