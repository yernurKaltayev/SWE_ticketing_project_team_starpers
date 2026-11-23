// @vitest-environment jsdom
import { afterEach, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ApiError } from "@biletflow/shared";
import { eventCopy } from "./copy";
import { EventError } from "./ui";

const t = eventCopy.en;
afterEach(cleanup);
const show = (error: unknown) => {
  render(<EventError error={error} t={t} />);
  return screen.getByRole("alert").textContent ?? "";
};

it("explains a rejected ticket instead of blaming the connection", () => {
  const text = show(
    new ApiError(
      422,
      "invalid_sales_window",
      "Sales cannot end after the event ends.",
    ),
  );
  expect(text).toContain(t.salesWindowError);
  expect(text).not.toContain(t.error);
});

it("shows the server's reason for an unmapped rejection", () => {
  expect(
    show(new ApiError(422, "something_new", "Readable reason.")),
  ).toContain("Readable reason.");
});

it("reports a server failure as a server error", () => {
  expect(show(new ApiError(500, "internal_error", "boom"))).toContain(
    t.serverError,
  );
});

it("keeps the connection message for requests that never reached the server", () => {
  expect(show(new ApiError(0, "network_error", "unreachable"))).toContain(
    t.error,
  );
});
