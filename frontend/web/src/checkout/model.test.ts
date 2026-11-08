import { expect, it } from "vitest";
import {
  makeOrderBody,
  parseAvailability,
  parseEvent,
  parseOrder,
  parseTicket,
  registrationOpen,
  ticketPath,
  validateBinary,
} from "./model";
import type { Choice, Event } from "./model";
const choice: Choice = {
  id: "free",
  name: "Free",
  free: true,
  open: true,
  available: 5,
  limit: 2,
};
const attendees = [
  { full_name: "  Example Person  ", email: " person@example.com " },
];

it("understands implemented P3 availability without converting paid prices into free tickets", () => {
  const result = parseAvailability({
    registration_open: true,
    ticket_types: [
      {
        id: "free",
        name: "Free",
        is_free: true,
        price_amount: "0",
        currency: "KZT",
        quantity_available: 2,
        max_per_order: 1,
        sales_open: true,
      },
      {
        id: "paid",
        name: "Paid",
        is_free: false,
        price_amount: "10.00",
        currency: "KZT",
        quantity_available: 3,
        max_per_order: 2,
        sales_open: false,
      },
    ],
  });
  expect(result.choices[0]).toEqual({ ...choice, available: 2, limit: 1 });
  expect(result.choices[1]?.free).toBe(false);
  expect(result.choices[1]?.open).toBe(false);
  expect(
    parseAvailability([
      {
        ticket_type_id: "free",
        name: "Free",
        price_amount: 0,
        currency: "KZT",
        available: 2,
        on_sale: true,
      },
    ]).choices[0]?.free,
  ).toBe(true);
});

it("rejects malformed availability, unsupported currency and a free flag on a nonzero price", () => {
  expect(() =>
    parseAvailability({ ticket_types: [], registration_open: "yes" }),
  ).toThrow();
  expect(() =>
    parseAvailability([
      {
        ticket_type_id: "x",
        name: "x",
        price_amount: 0,
        currency: "USD",
        available: 3,
        on_sale: true,
      },
    ]),
  ).toThrow();
  expect(
    parseAvailability({
      registration_open: true,
      ticket_types: [
        {
          id: "x",
          name: "x",
          is_free: true,
          price_amount: "1",
          currency: "KZT",
          quantity_available: 1,
          max_per_order: 1,
          sales_open: true,
        },
      ],
    }).choices[0]?.free,
  ).toBe(false);
});

it("binds exactly one attendee to each selected ticket, enforces caps and never sends client totals", () => {
  expect(makeOrderBody("event", [choice], { free: 1 }, attendees)).toEqual({
    event_id: "event",
    items: [{ ticket_type_id: "free", quantity: 1, seat_ids: [] }],
    attendees: [{ full_name: "Example Person", email: "person@example.com" }],
    hold_ids: [],
    promo_code: null,
  });
  for (const quantity of [-1, 0, 1.5, 3, 101])
    expect(() =>
      makeOrderBody("event", [choice], { free: quantity }, attendees),
    ).toThrow();
  expect(() =>
    makeOrderBody(
      "event",
      [{ ...choice, free: false }],
      { free: 1 },
      attendees,
    ),
  ).toThrow();
  expect(() =>
    makeOrderBody("event", [choice], { free: 1 }, [
      { full_name: "Name", email: "invalid" },
    ]),
  ).toThrow();
  expect(() =>
    makeOrderBody("event", [choice], { free: 2 }, attendees),
  ).toThrow();
});

it("keeps assigned, cancelled, not-open, ended and closed registrations unavailable", () => {
  const event = {
    status: "published",
    seating_mode: "general_admission",
    starts_at: "2027-01-01T00:00:00Z",
    registration_opens_at: null,
    registration_closes_at: null,
  } as Event;
  const availability = { registrationOpen: true, choices: [choice] };
  const now = Date.parse("2026-11-08T00:00:00Z");
  expect(registrationOpen(event, availability, now)).toBe(true);
  expect(
    registrationOpen({ ...event, seating_mode: "assigned" }, availability, now),
  ).toBe(false);
  expect(
    registrationOpen({ ...event, status: "cancelled" }, availability, now),
  ).toBe(false);
  expect(
    registrationOpen(event, { ...availability, registrationOpen: false }, now),
  ).toBe(false);
  expect(
    registrationOpen(
      { ...event, registration_opens_at: "2026-12-01T00:00:00Z" },
      availability,
      now,
    ),
  ).toBe(false);
  expect(
    registrationOpen(event, availability, Date.parse("2027-02-01T00:00:00Z")),
  ).toBe(false);
});

it("rejects malformed server data and builds private download paths without trusting response URLs", () => {
  expect(() => parseOrder({ id: "x", total: 0 })).toThrow();
  expect(() => parseEvent({ title: "missing metadata" })).toThrow();
  const ticket = parseTicket({
    id: "ticket",
    ticket_number: "T1",
    event_id: "event",
    ticket_type: "Free",
    attendee_name: "Person",
    status: "valid",
    seat: null,
    qr_url: "https://evil.example/qr",
    pdf_url: "https://evil.example/pdf",
  });
  expect(ticketPath(ticket, "pdf")).toBe("/api/v1/tickets/ticket/pdf");
  expect(() =>
    validateBinary(new Blob(["<html>"], { type: "text/html" }), "pdf"),
  ).toThrow();
  expect(() =>
    validateBinary(new Blob([], { type: "image/png" }), "qr"),
  ).toThrow();
});
