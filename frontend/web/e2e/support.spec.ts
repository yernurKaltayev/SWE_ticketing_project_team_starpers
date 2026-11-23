import { test, expect } from "@playwright/test";
const eventId = "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419";
test("F9 attendee and responder exchange messages, update a case and read its notifications", async ({
  page,
}) => {
  await page.goto(
    `/login?returnTo=${encodeURIComponent(`/support/new?event_id=${eventId}`)}`,
  );
  await page.locator(".language-control select").selectOption("en");
  async function login(email: string) {
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill("BiletFlow123!");
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
  }
  await login("attendee@example.com");
  await page
    .getByLabel("Subject", { exact: true })
    .fill("Dias F9 ticket question");
  await page
    .getByLabel("Issue category", { exact: true })
    .selectOption("ticket_delivery");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Please help me find my ticket.");
  await page.getByRole("button", { name: "Open case", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dias F9 ticket question" }),
  ).toBeVisible();
  const caseId = page.url().split("/support/cases/")[1]!.split("?")[0]!;
  // A separate HTTP actor posts into the same development fixture state. This
  // deliberately verifies polling, not production mail delivery or live API security.
  await page.evaluate(async (id) => {
    const login = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "organizer@example.com",
        password: "BiletFlow123!",
      }),
    }).then((r) => r.json());
    const r = await fetch(`/api/v1/support/cases/${id}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${login.access_token}`,
      },
      body: JSON.stringify({ body: "Your ticket is in My tickets." }),
    });
    if (!r.ok) throw new Error("Could not post responder fixture");
  }, caseId);
  await expect(
    page.getByText("Your ticket is in My tickets.", { exact: true }),
  ).toBeVisible({ timeout: 15000 });
  await expect(
    page.getByLabel("Choose responder", { exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login("organizer@example.com");
  await page
    .getByLabel("Choose responder", { exact: true })
    .selectOption({ label: "Assign to me" });
  await page
    .getByLabel("Status", { exact: true })
    .selectOption("waiting_customer");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByText("Server confirmed the change.")).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login("attendee@example.com");
  await page.getByRole("link", { name: /^Notifications/ }).click();
  await expect(
    page.getByRole("heading", { name: "Notifications", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Mark as read", exact: true })
    .first()
    .click();
  await expect(page.getByText("Read", { exact: true }).first()).toBeVisible();
  await page
    .getByRole("link", { name: "Open related page", exact: true })
    .first()
    .click();
  await page
    .getByLabel("Message", { exact: true })
    .fill("Thank you, I still have one question.");
  await page.getByRole("button", { name: "Send message", exact: true }).click();
  await expect(
    page.getByText("Thank you, I still have one question.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await login("organizer@example.com");
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
    "in_progress",
  );
  await page.getByLabel("Status", { exact: true }).selectOption("resolved");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
    "resolved",
  );
  await expect(
    page.getByText("Please help me find my ticket.", { exact: true }),
  ).toBeVisible();
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
