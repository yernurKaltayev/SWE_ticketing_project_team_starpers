/** Event cover image rules, shared by the web cover editor and the mobile image field. */
export const coverRules = {
  types: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 5 * 1024 * 1024,
} as const;

/** Why a picked file cannot be a cover, or null when it can. */
export function coverProblem(file: {
  type?: string | null;
  size?: number | null;
}): "type" | "size" | null {
  if (!file.type || !(coverRules.types as readonly string[]).includes(file.type)) return "type";
  if (typeof file.size === "number" && file.size > coverRules.maxBytes) return "size";
  return null;
}
