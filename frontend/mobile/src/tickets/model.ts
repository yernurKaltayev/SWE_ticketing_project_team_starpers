import type { components } from "@biletflow/shared/api";

export type MyTicket = components["schemas"]["TicketOut"];
export type TicketPage = components["schemas"]["PageTicketOut"];
export type TicketTone = "success" | "warning" | "danger" | "neutral";

const id = encodeURIComponent;

/** API paths for the attendee's own tickets. */
export const ticketPaths = {
  mine: (offset = 0, limit = 50) =>
    `/api/v1/me/tickets?${new URLSearchParams({ limit: String(limit), offset: String(offset) })}`,
  ticket: (ticketId: string) => `/api/v1/tickets/${id(ticketId)}`,
  qr: (ticketId: string) => `/api/v1/tickets/${id(ticketId)}/qr`,
  event: (eventId: string) => `/api/v1/events/${id(eventId)}`,
};

export function ticketTone(status: string): TicketTone {
  switch (status) {
    case "valid":
      return "success";
    case "checked_in":
      return "warning";
    case "refunded":
    case "cancelled":
      return "danger";
    default:
      return "neutral";
  }
}

/** Only a valid ticket can still be admitted; the scanner decides, this is only a hint. */
export function isAdmissible(status: string): boolean {
  return status === "valid";
}

/** The server's QR PNG as a data URI that <Image> can show without another request. */
export async function blobToDataUri(blob: Blob): Promise<string> {
  // React Native Blobs reliably support FileReader only; other runtimes use arrayBuffer.
  if (typeof FileReader === "undefined") {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return `data:${blob.type || "application/octet-stream"};base64,${btoa(binary)}`;
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error("read_failed"));
    reader.readAsDataURL(blob);
  });
}
