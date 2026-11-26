export type ShareExtension = "pdf" | "csv" | "ics" | "png";

const mimes: Record<ShareExtension, string> = {
  pdf: "application/pdf",
  csv: "text/csv",
  ics: "text/calendar",
  png: "image/png",
};

/** iOS share sheet type identifiers, so receiving apps recognise the file. */
export const utis: Record<ShareExtension, string> = {
  pdf: "com.adobe.pdf",
  csv: "public.comma-separated-values-text",
  ics: "com.apple.ical.ics",
  png: "public.png",
};

/** Same character rule as the web ticket PDF download name, never empty. */
export function safeFileName(base: string, extension: ShareExtension): string {
  const name = base.replace(/[^a-z\d_-]/gi, "_").slice(0, 100) || "biletflow";
  return `${name}.${extension}`;
}

export function mimeFor(extension: ShareExtension): string {
  return mimes[extension];
}
