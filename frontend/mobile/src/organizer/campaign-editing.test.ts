import { describe, expect, it } from "vitest";
import { editingAfterSave } from "./campaign-editing";

const a = { id: "a" };
const b = { id: "b" };

describe("editingAfterSave", () => {
  it("closes the form only for the campaign that was saved", () => {
    expect(editingAfterSave(a, a)).toBeNull();
    expect(editingAfterSave(a, b)).toBe(a);
  });
  it("closes the new-campaign form after creating", () => {
    expect(editingAfterSave("new", undefined)).toBeNull();
    expect(editingAfterSave("new", b)).toBe("new");
  });
  it("leaves a closed editor closed", () => {
    expect(editingAfterSave(null, b)).toBeNull();
  });
});
