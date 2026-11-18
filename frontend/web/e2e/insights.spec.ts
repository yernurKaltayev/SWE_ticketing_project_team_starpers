import { test, expect } from "@playwright/test";
const eventId = "04e1dfa3-c0a1-43d7-a774-32c7dc9fb419";
test("F10 organizer reads analytics/history, retains a past event and duplicates configuration", async ({
  page
}) => {
  await page.goto(`/login?returnTo=${encodeURIComponent(`/organizer/events/${eventId}/analytics`)}`);
  await page.locator(".language-control select").selectOption("en");
  await page.getByLabel("Email", {
    exact: true
  }).fill("organizer@example.com");
  await page.getByLabel("Password", {
    exact: true
  }).fill("BiletFlow123!");
  await page.getByRole("button", {
    name: "Sign in",
    exact: true
  }).click();
  await expect(page.getByRole("heading", {
    name: "Analytics",
    exact: true
  })).toBeVisible();
  // Use HTTP actors in the same tab so the MSW worker retains its in-memory records.
  await page.evaluate(async id => {
    const login = async (email: string) => {
      const r = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          password: "BiletFlow123!"
        })
      });
      if (!r.ok) throw new Error("Mock login failed");
      return (await r.json()).access_token as string;
    };
    const owner = await login("organizer@example.com"),
      buyer = await login("attendee@example.com");
    const call = async (path: string, token: string, method = "GET", body?: unknown) => {
      const r = await fetch(`/api/v1${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "Idempotency-Key": crypto.randomUUID()
        },
        ...(body ? {
          body: JSON.stringify(body)
        } : {})
      });
      if (!r.ok) throw new Error(`${path}: ${r.status}`);
      return r.json();
    };
    const types = await call(`/events/${id}/ticket-types`, owner);
    await call("/orders", buyer, "POST", {
      event_id: id,
      items: [{
        ticket_type_id: types.items[0].id,
        quantity: 1
      }],
      attendees: [{
        full_name: "Dias analytics",
        email: "dias@example.com"
      }],
      hold_ids: []
    });
    await call(`/events/${id}`, owner, "PATCH", {
      starts_at: "2026-01-20T10:00:00Z",
      ends_at: "2026-01-20T12:00:00Z"
    });
  }, eventId);
  await page.getByRole("button", {
    name: "Refresh records",
    exact: true
  }).click();
  await expect(page.locator(".insights-metric").filter({
    has: page.getByText("Current valid/checked-in tickets", {
      exact: true
    })
  }).locator("dd")).toHaveText("1");
  await expect(page.getByRole("table", {
    name: "Sales over time",
    exact: true
  })).toBeVisible();
  await page.locator(".insights-links").getByRole("link", {
    name: "Activity history",
    exact: true
  }).click();
  await expect(page.getByText("Event updated", {
    exact: true
  })).toBeVisible();
  await page.locator(".insights").getByRole("link", {
    name: "Events by lifecycle",
    exact: true
  }).click();
  await page.getByRole("link", {
    name: "Completed (1)",
    exact: true
  }).click();
  await expect(page.getByRole("link", {
    name: "Check-in totals",
    exact: true
  })).toBeVisible();
  await page.getByRole("button", {
    name: "Duplicate into a new draft",
    exact: true
  }).click();
  await expect(page.getByRole("button", {
    name: "Keep unchanged",
    exact: true
  })).toBeFocused();
  await page.getByRole("button", {
    name: "Keep unchanged",
    exact: true
  }).click();
  await page.getByRole("button", {
    name: "Duplicate into a new draft",
    exact: true
  }).click();
  await page.getByRole("dialog").getByRole("button", {
    name: "Confirm action",
    exact: true
  }).click();
  await expect(page).toHaveURL(/\/organizer\/events\/(?!04e1dfa3)[^/]+\/edit$/);
  await expect(page.getByRole("heading", {
    name: "Edit event",
    exact: true
  })).toBeVisible();
});
test("F10 admin confirms settings, moderates a report, suspends an event and exports CSV", async ({
  page
}) => {
  await page.goto("/login?returnTo=%2Fadmin%2Fsettings");
  await page.locator(".language-control select").selectOption("en");
  await page.getByLabel("Email", {
    exact: true
  }).fill("admin@example.com");
  await page.getByLabel("Password", {
    exact: true
  }).fill("BiletFlow123!");
  await page.getByRole("button", {
    name: "Sign in",
    exact: true
  }).click();
  await page.getByLabel("Activation fee (KZT)", {
    exact: true
  }).fill("123.45");
  await page.getByRole("button", {
    name: "Review changes",
    exact: true
  }).click();
  await page.getByRole("dialog").getByRole("button", {
    name: "Confirm action",
    exact: true
  }).click();
  await expect(page.getByText("Server confirmed the change.", {
    exact: true
  })).toBeVisible();
  await page.evaluate(async id => {
    const token = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: "attendee@example.com",
        password: "BiletFlow123!"
      })
    }).then(r => r.json());
    const r = await fetch(`/api/v1/events/${id}/reports`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token.access_token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        reason: "Dias F10 review concern"
      })
    });
    if (!r.ok) throw new Error("Fixture report failed");
  }, eventId);
  await page.getByRole("navigation", {
    name: "Platform administration",
    exact: true
  }).getByRole("link", {
    name: "Reported events",
    exact: true
  }).click();
  await page.getByRole("row").filter({
    hasText: "Dias F10 review concern"
  }).getByRole("button", {
    name: "View details",
    exact: true
  }).click();
  await page.getByRole("button", {
    name: "Reviewed",
    exact: true
  }).click();
  await page.getByRole("dialog").getByRole("button", {
    name: "Confirm action",
    exact: true
  }).click();
  await expect(page.getByText("Server confirmed the change.", {
    exact: true
  })).toBeVisible();
  await page.getByRole("navigation", {
    name: "Platform administration",
    exact: true
  }).getByRole("link", {
    name: "Events",
    exact: true
  }).click();
  await page.getByRole("row").filter({
    hasText: "Demo · Student technology meetup"
  }).getByRole("button", {
    name: "View details",
    exact: true
  }).click();
  await page.getByRole("button", {
    name: "Suspend",
    exact: true
  }).click();
  await page.getByLabel("Reason", {
    exact: true
  }).fill("Admin review in progress");
  await page.getByRole("dialog").getByRole("button", {
    name: "Confirm action",
    exact: true
  }).click();
  await expect(page.getByText("Server confirmed the change.", {
    exact: true
  })).toBeVisible();
  await page.getByRole("row").filter({
    hasText: "Demo · Student technology meetup"
  }).getByRole("button", {
    name: "View details",
    exact: true
  }).click();
  await expect(page.getByRole("button", {
    name: "Reinstate",
    exact: true
  })).toBeVisible();
  await page.getByRole("navigation", {
    name: "Platform administration",
    exact: true
  }).getByRole("link", {
    name: "Operational exports",
    exact: true
  }).click();
  await page.getByLabel("Operational exports", {
    exact: true
  }).selectOption("events");
  const download = page.waitForEvent("download");
  await page.getByRole("button", {
    name: "Download CSV",
    exact: true
  }).click();
  expect((await download).suggestedFilename()).toBe("events.csv");
  await page.setViewportSize({
    width: 390,
    height: 844
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
