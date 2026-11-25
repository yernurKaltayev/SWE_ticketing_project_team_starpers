import { describe, expect, it } from "vitest";
import {
  instantFromWall,
  moneyText,
  moneyValue,
  pickerDateFromInstant,
  wallFromPicker,
} from "./values";

describe("money", () => {
  it("reads KZT text into tiyn without rounding", () => {
    expect(moneyValue("1 500,5")).toEqual({ amount: 150050, error: null });
    expect(moneyValue("1 500")).toEqual({ amount: 150000, error: null });
    expect(moneyValue("0")).toEqual({ amount: 0, error: null });
  });
  it("treats empty text as no amount", () => {
    expect(moneyValue("  ")).toEqual({ amount: null, error: null });
  });
  it("rejects anything it cannot represent exactly", () => {
    for (const text of ["10.999", "-1", "abc", "1,2,3"])
      expect(moneyValue(text)).toEqual({ amount: null, error: "price" });
  });
  it("shows a stored amount as editable text", () => {
    expect(moneyText(150050)).toBe("1500.50");
    expect(moneyText(null)).toBe("");
  });
});

describe("event-zone dates", () => {
  it("saves the wall time in the event's zone", () => {
    expect(instantFromWall("2027-03-10T19:00", "Europe/Moscow")).toEqual({
      iso: "2027-03-10T16:00:00.000Z",
      error: null,
    });
  });
  it("rejects a wall time that does not exist (DST gap)", () => {
    expect(instantFromWall("2027-03-28T02:30", "Europe/Berlin")).toEqual({
      iso: null,
      error: "date",
    });
  });
  it("opens the picker on the event's wall time whatever the device zone", () => {
    expect(wallFromPicker(pickerDateFromInstant("2027-03-10T16:00:00.000Z", "Europe/Moscow"))).toBe(
      "2027-03-10T19:00",
    );
  });
  it("reads the picker's device-local wall clock", () => {
    expect(wallFromPicker(new Date(2027, 0, 5, 7, 3))).toBe("2027-01-05T07:03");
  });
});
