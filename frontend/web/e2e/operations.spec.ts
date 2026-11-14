import { test, expect } from "@playwright/test";
const eventId = "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419";
test("F6 organizer reviews impact, cancels a free registration and exports attendees", async ({
  page,
}) => {
  await page.goto(
    `/login?returnTo=${encodeURIComponent(`/organizer/events/${eventId}/orders`)}`,
  );
  await page.locator(".language-control select").selectOption("en");
  await expect(page.getByLabel("Email", { exact: true })).toBeVisible();
  // Seed through the existing HTTP mocks in this page, preserving the in-memory
  // fixture state across SPA sign-in. This is not live-backend evidence.
  const number = await page.evaluate(async (id) => {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "attendee@example.com",
        password: "BiletFlow123!",
      }),
    });
    const token = (await response.json()).access_token;
    const available = await fetch(`/api/v1/events/${id}/availability`).then(
      (r) => r.json(),
    );
    const type = Array.isArray(available)
      ? available[0].ticket_type_id
      : available.ticket_types[0].id;
    const result = await fetch("/api/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "Idempotency-Key": crypto.randomUUID(),
      },
      body: JSON.stringify({
        event_id: id,
        items: [{ ticket_type_id: type, quantity: 1 }],
        attendees: [{ full_name: "Диас", email: "dias@example.com" }],
        hold_ids: [],
      }),
    });
    if (!result.ok) throw new Error("Could not seed frontend fixture");
    return (await result.json()).order_number as string;
  }, eventId);
  await page.getByLabel("Email", { exact: true }).fill("organizer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("BiletFlow123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("link", { name: number, exact: true }).click();
  await page
    .getByRole("button", { name: "Cancel registration", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("affected tickets become invalid");
  await expect(
    dialog.getByRole("button", { name: "Keep unchanged" }),
  ).toBeFocused();
  await dialog.getByRole("button", { name: "Confirm action" }).click();
  await expect(page.getByText("Server confirmed the operation.")).toBeVisible();
  await page.getByRole("link", { name: "Attendees", exact: true }).click();
  await expect(page.getByText("dias@example.com")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("cancelled");
  await page.getByRole("button", { name: "Apply filters" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toContain("attendees-");
  for (const language of ["en", "ru", "kk"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".language-control select").selectOption(language);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
});
