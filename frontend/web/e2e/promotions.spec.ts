import { test, expect } from "@playwright/test";
const id = "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419";
test("F8 campaign management, linked sign-in, discounted order and attribution", async ({
  page,
}) => {
  await page.goto(
    `/login?returnTo=${encodeURIComponent(`/organizer/events/${id}/promotions`)}`,
  );
  await page.locator(".language-control select").selectOption("en");
  await page.getByLabel("Email", { exact: true }).fill("organizer@example.com");
  await page.getByLabel("Password", { exact: true }).fill("BiletFlow123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  // Seed existing F4 activation through its HTTP mock contract; this is not a real payment.
  await page.evaluate(async (eventId) => {
    const login = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "organizer@example.com",
        password: "BiletFlow123!",
      }),
    }).then((r) => r.json());
    const call = async (path: string, method = "GET", body?: unknown) => {
      const r = await fetch(`/api/v1${path}`, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${login.access_token}`,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    };
    const types = await call(`/events/${eventId}/ticket-types`);
    const ticket = (Array.isArray(types) ? types : types.items)[0];
    await call(`/events/${eventId}/ticket-types/${ticket.id}`, "PATCH", {
      price_amount: 100000,
      is_free: false,
    });
    const account = await call("/organizers/me/payout-accounts", "POST", {
      bank_name: "Demo bank",
      holder_name: "Demo organizer",
      iban: "KZ86125KZT5004100100",
    });
    await call(`/events/${eventId}/activation/verify-identity`, "POST");
    await call(`/events/${eventId}/activation`, "PATCH", {
      payout_account_id: account.id,
      accept_terms: true,
    });
    const payment = await call(`/events/${eventId}/activation/pay`, "POST");
    await call(`/payments/${payment.id}/simulate`, "POST", {
      outcome: "succeeded",
    });
  }, id);
  await page
    .getByRole("button", { name: "Create campaign", exact: true })
    .click();
  await page
    .getByLabel("Campaign name", { exact: true })
    .fill("Dias student campaign");
  await page
    .getByLabel("Discount value · Percent", { exact: true })
    .fill("100");
  await page.getByLabel("Valid from", { exact: true }).fill("2026-01-01T10:00");
  await page
    .getByLabel("Valid until", { exact: true })
    .fill("2028-01-01T10:00");
  await page
    .getByRole("button", { name: "Save campaign", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dias student campaign" }),
  ).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Campaign QR" }).click();
  expect((await download).suggestedFilename()).toMatch(/^campaign-.*\.png$/);
  await page.getByRole("link", { name: "Preview event with code" }).click();
  await page.getByRole("button", { name: "Account menu" }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await page.getByRole("link", { name: "Registration", exact: true }).click();
  await expect(page).toHaveURL(/login.*promo/);
  await page.getByLabel("Email", { exact: true }).fill("attendee@example.com");
  await page.getByLabel("Password", { exact: true }).fill("BiletFlow123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("spinbutton").fill("1");
  await expect(page.getByText(/Discount preview:/)).toContainText("1,000.00");
  for (const locale of ["en", "ru", "kk"]) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator(".language-control select").selectOption(locale);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.locator(".language-control select").selectOption("en");
  await page.getByRole("button", { name: "Review registration" }).click();
  await page.getByRole("button", { name: "Create order and continue" }).click();
  await expect(
    page.getByRole("heading", { name: "Registration confirmed" }),
  ).toBeVisible();
  // Query the same completed order source the organizer report UI uses.
  const report = await page.evaluate(async (eventId) => {
    const login = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: "organizer@example.com",
        password: "BiletFlow123!",
      }),
    }).then((r) => r.json());
    const headers = { Authorization: `Bearer ${login.access_token}` };
    const list = await fetch(`/api/v1/events/${eventId}/campaigns`, {
      headers,
    }).then((r) => r.json());
    return fetch(`/api/v1/campaigns/${list.items[0].id}/report`, {
      headers,
    }).then((r) => r.json());
  }, id);
  expect(report).toMatchObject({
    orders: 1,
    tickets_sold: 1,
    gross_revenue: 100000,
    discount: 100000,
    net_revenue: 0,
  });
});
