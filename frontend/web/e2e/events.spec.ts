import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
async function start(page: Page) {
  await page.goto("/");
  await page.locator(".language-control select").selectOption("en");
  await expect(
    page.getByRole("heading", { name: "Discover events" }),
  ).toBeVisible();
}
async function login(page: Page, email = "organizer@example.com") {
  await page.getByRole("link", { name: "Sign in", exact: true }).click();
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password", { exact: true }).fill("BiletFlow123!");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
}
test("organizer creates a free event, corrects publication, previews, publishes, edits and duplicates", async ({
  page,
}) => {
  await start(page);
  await login(page);
  await page.getByRole("link", { name: "My events", exact: true }).click();
  await page.getByRole("link", { name: "Create event" }).click();
  await page
    .getByLabel("Title", { exact: true })
    .fill("Demo · Dias free event");
  await page
    .getByLabel("Description", { exact: true })
    .fill("Demonstration free event.");
  await page.getByLabel("Category", { exact: true }).fill("student");
  await page
    .getByLabel("Venue", { exact: true })
    .selectOption({
      label: "Demo campus auditorium · Astana · Demo venue address",
    });
  await page.getByLabel("Starts", { exact: true }).fill("2027-02-01T18:00");
  await page.getByLabel("Ends", { exact: true }).fill("2027-02-01T20:00");
  await page.getByRole("button", { name: "Save draft / changes" }).click();
  await expect(
    page.getByRole("heading", { name: "Edit event", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Add a ticket type");
  await page.getByRole("button", { name: "Add ticket type" }).click();
  await page.getByLabel("Ticket name", { exact: true }).fill("Free admission");
  await page.getByRole("button", { name: "Save ticket type" }).click();
  await expect(
    page.getByRole("rowheader", { name: "Free admission", exact: true }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Protected preview" }).click();
  await expect(
    page.getByRole("heading", { name: "Demo · Dias free event" }),
  ).toBeVisible();
  await expect(page.getByText("Asia/Almaty").first()).toBeVisible();
  await page.getByRole("link", { name: "Edit event", exact: true }).click();
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Return to draft" }),
  ).toBeVisible();
  await page
    .getByRole("link", { name: "Discover events", exact: true })
    .click();
  await page.getByLabel("Search", { exact: true }).fill("Dias");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page).toHaveURL(/q=Dias/);
  await page.getByRole("link", { name: "Demo · Dias free event" }).click();
  await expect(page.getByText("Free admission", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "My events", exact: true }).click();
  await page.getByRole("link", { name: "Demo · Dias free event" }).click();
  await page.getByRole("button", { name: "Duplicate into new draft" }).click();
  await expect(
    page.getByRole("button", { name: "Publish", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("rowheader", { name: "Free admission", exact: true }),
  ).toBeVisible();
});
test("filters, missing event, responsive locales, attendee permissions", async ({
  page,
}) => {
  await start(page);
  await page.getByLabel("Search", { exact: true }).fill("not-a-real-event");
  await page.getByRole("button", { name: "Apply filters" }).click();
  await expect(page.getByText("No events found.")).toBeVisible();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("link", { name: "Demo · Student technology meetup" })
    .click();
  await expect(
    page.getByText("Demo campus auditorium · Demo venue address · Astana"),
  ).toBeVisible();
  for (const locale of ["kk", "ru", "en"]) {
    await page.locator(".language-control select").selectOption(locale);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBeTruthy();
  }
  await login(page, "attendee@example.com");
  await page.evaluate(() => {
    history.pushState({}, "", "/organizer/events/new");
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByRole("heading", { name: "Access denied" }),
  ).toBeVisible();
  await page.goto("/events/00000000-0000-0000-0000-000000000000");
  await page.locator(".language-control select").selectOption("en");
  await expect(page.getByRole("alert")).toContainText(
    "missing or you do not have access",
  );
});
