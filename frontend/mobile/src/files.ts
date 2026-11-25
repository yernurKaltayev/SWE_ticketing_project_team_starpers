import { File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ApiError } from "@biletflow/shared";
import { session } from "./session";
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
): Promise<"shared" | "unavailable"> {
  if (!session) throw new ApiError(0, "not_configured", "EXPO_PUBLIC_API_ORIGIN is not set.");
  const blob = await session.request<Blob>(path, { responseType: "blob" });
  const dataUri = await blobToDataUri(blob);
  const base64 = dataUri.slice(dataUri.indexOf(",") + 1);
  const file = new File(Paths.cache, safeFileName(base, extension));
  if (file.exists) file.delete();
  file.create();
  await file.write(base64, { encoding: "base64" });
  if (!(await Sharing.isAvailableAsync())) return "unavailable";
  await Sharing.shareAsync(file.uri, { mimeType: mimeFor(extension), UTI: utis[extension] });
  return "shared";
}
