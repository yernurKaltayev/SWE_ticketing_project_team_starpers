/**
 * Which campaign form stays open after a save. Only the saved campaign's form closes, so
 * toggling another campaign never discards unsaved edits.
 */
export function editingAfterSave<T extends { id: string }>(
  editing: T | "new" | null,
  saved: { id: string } | undefined,
): T | "new" | null {
  if (editing === null) return null;
  if (editing === "new") return saved === undefined ? null : editing;
  return saved?.id === editing.id ? null : editing;
}
