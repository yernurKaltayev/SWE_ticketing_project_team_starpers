import { describe, expect, it } from "vitest";
import { ApiError } from "@biletflow/shared";
import type { components } from "@biletflow/shared/api";
import { authCopy } from "./copy";
import { fieldErrors, hasRole, safeReturnTo } from "./helpers";

describe("safeReturnTo", () => {
  it("preserves app paths, query state and fragments through sign-in", () => {
    for (const destination of [
      "/account",
      "/organizer/profile",
      "/events/123/checkout?promo=STUDENT&quantity=2#attendee",
      "/events?search=%D0%90%D0%BB%D0%BC%D0%B0%D1%82%D1%8B",
    ])
      expect(safeReturnTo(destination)).toBe(destination);
  });

  it("rejects external, credential-bearing, encoded separator and malformed destinations", () => {
    for (const destination of [
      null,
      undefined,
      "",
      "https://other.example/account",
      "javascript:alert(1)",
      "//other.example/account",
      "//user:secret@other.example/",
      "\\other.example",
      "/\\other.example",
      "/%5cother.example",
      "/%2f%2fother.example",
      "/\t/other.example",
      "/%0a/other.example",
      " /account",
      "/invalid%",
    ])
      expect(safeReturnTo(destination), String(destination)).toBe("/account");
  });

  it("rejects auth loops including case-insensitive and encoded route matches", () => {
    for (const destination of [
      "/login",
      "/login?returnTo=/account",
      "/register",
      "/verify-email?token=secret",
      "/forgot-password",
      "/reset-password",
      "/LOGIN",
      "/ReGiStEr",
      "/Verify-Email",
      "/%6cogin",
      "/events/../login",
      "/login/extra",
    ])
      expect(safeReturnTo(destination), destination).toBe("/account");
  });
});

const attendee: components["schemas"]["UserOut"] = {
  id: "1",
  email: "attendee@example.com",
  full_name: "Attendee",
  phone: null,
  role: "attendee",
  email_verified_at: "2026-01-01T00:00:00Z",
};
describe("hasRole", () => {
  it("requires a signed-in user and an explicitly allowed global role", () => {
    expect(hasRole(null, ["organizer"])).toBe(false);
    expect(hasRole(attendee, ["attendee"])).toBe(true);
    expect(hasRole(attendee, [])).toBe(false);
    expect(hasRole(attendee, ["organizer", "platform_admin"])).toBe(false);
    expect(hasRole({ ...attendee, role: "organizer" }, ["organizer"])).toBe(
      true,
    );
    expect(
      hasRole({ ...attendee, role: "platform_admin" }, ["organizer"]),
    ).toBe(false);
    expect(
      hasRole({ ...attendee, role: "platform_admin" }, ["platform_admin"]),
    ).toBe(true);
  });

  it("does not infer staff assignments or administrator access from attendee identity", () => {
    expect(
      hasRole(attendee, ["organizer_staff", "manager", "checkin", "support"]),
    ).toBe(false);
    expect(
      hasRole({ ...attendee, role: "unknown" }, [
        "attendee",
        "organizer",
        "platform_admin",
      ]),
    ).toBe(false);
  });
});

describe("fieldErrors", () => {
  it("strips the backend body prefix and exposes only this form's allowed fields", () => {
    const error = new ApiError(422, "validation_error", "Internal message", [
      {
        field: "body.full_name",
        message: "Private submitted name",
        type: "value_error",
      },
      { field: "phone", message: "Private phone", type: "value_error" },
      { field: "body.email", message: "Hidden address", type: "value_error" },
      { field: "body.role", message: "Hidden role", type: "value_error" },
      null,
      1,
      "bad details",
      { field: 17 },
      {},
    ]);
    expect(fieldErrors(error, ["full_name", "phone"], "en")).toEqual({
      full_name: authCopy.en.nameRequired,
      phone: authCopy.en.phoneInvalid,
    });
  });

  it("localizes stable field messages without echoing server messages or submitted secrets", () => {
    const error = new ApiError(
      422,
      "validation_error",
      "Raw developer information",
      [
        { field: "body.email", message: "Secret email" },
        { field: "body.password", message: "Secret password" },
        { field: "body.new_password", message: "Another secret password" },
      ],
    );
    for (const locale of ["kk", "ru", "en"] as const) {
      expect(
        fieldErrors(error, ["email", "password", "new_password"], locale),
      ).toEqual({
        email: authCopy[locale].emailRequired,
        password: authCopy[locale].passwordInvalid,
        new_password: authCopy[locale].passwordInvalid,
      });
    }
  });

  it("ignores non-validation errors and malformed details", () => {
    for (const error of [
      null,
      new Error("failure"),
      new ApiError(401, "invalid_credentials", "Sign-in failed", [
        { field: "email" },
      ]),
      new ApiError(422, "validation_error", "Invalid", {
        email: "not a details array",
      }),
    ])
      expect(fieldErrors(error, ["email"], "en")).toEqual({});
  });
});
