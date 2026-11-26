import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ApiError } from "@biletflow/shared";
import { api, session } from "./session";
import { blobToDataUri } from "./tickets/model";
import { mimeFor, safeFileName, utis } from "./file-names";
import type { ShareExtension } from "./file-names";

/**
 * Downloads a protected file (ticket PDF, CSV export, .ics) through the signed-in session,
 * saves it in the cache directory and opens the OS share sheet. Errors reach the caller.
 */
export async function downloadAndShare(
  path: string,
  base: string,
  extension: ShareExtension,
  signal?: AbortSignal,
  publicFile = false,
): Promise<"shared" | "unavailable" | "cancelled"> {
  const transport = session?.getSnapshot().user ? session : publicFile ? api : null;
  if (!transport) throw new ApiError(0, "not_configured", "EXPO_PUBLIC_API_ORIGIN is not set.");
  const owner = session?.getSnapshot().user?.id;
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  if (signal?.aborted || session?.getSnapshot().user?.id !== owner) return "cancelled";
  const mimeType = mimeFor(extension);
  const blob = await transport.request<Blob>(path, {
    signal,
    responseType: "blob",
    headers: { Accept: mimeType },
  });
  if (!blob.size || blob.type.split(";")[0].trim().toLowerCase() !== mimeType)
    throw new ApiError(200, "invalid_response", "The downloaded file has an unexpected content type.");
  const dataUri = await blobToDataUri(blob);
  if (signal?.aborted || session?.getSnapshot().user?.id !== owner) return "cancelled";
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  await shareContent(base, extension, base64, true);
  return "shared";
}

export async function shareCsv(base: string, content: string) {
  if (!(await Sharing.isAvailableAsync())) throw new Error("sharing unavailable");
  await shareContent(base, "csv", content, false);
}

async function shareContent(base: string, extension: ShareExtension, content: string, base64: boolean) {
  // The receiving app can read the file asynchronously. Keep it in the OS-managed cache.
  const folder = new Directory(Paths.cache, `share-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const file = new File(folder, safeFileName(base, extension));
  folder.create();
  try {
    file.create();
    file.write(content, { encoding: base64 ? "base64" : "utf8" });
    await Sharing.shareAsync(file.uri, { mimeType: mimeFor(extension), UTI: utis[extension] });
  } catch (error) {
    if (folder.exists) folder.delete();
    throw error;
  }
}
