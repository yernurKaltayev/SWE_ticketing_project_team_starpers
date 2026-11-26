import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ApiError } from "@biletflow/shared";
import { api, session } from "./session";
import { blobToDataUri } from "./tickets/model";
import { downloadProblem, mimeFor, oldShareFolders, safeFileName, utis } from "./file-names";
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
  const signedIn = Boolean(session?.getSnapshot().user);
  const problem = downloadProblem({ configured: Boolean(session ?? api), signedIn, publicFile });
  if (problem === "not_configured") throw new ApiError(0, problem, "EXPO_PUBLIC_API_ORIGIN is not set.");
  if (problem === "session_expired") throw new ApiError(401, problem, "Sign in again to download this file.");
  const transport = signedIn ? session : api;
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

/** Earlier shares are finished by now; remove their copies (attendee CSVs hold personal data). */
function removeOldShares() {
  try {
    const cache = new Directory(Paths.cache);
    const old = new Set(oldShareFolders(cache.list().map((entry) => entry.name)));
    for (const entry of cache.list()) if (entry instanceof Directory && old.has(entry.name)) entry.delete();
  } catch {
    // Best effort: the OS also evicts the cache.
  }
}

async function shareContent(base: string, extension: ShareExtension, content: string, base64: boolean) {
  // The receiving app can read the file asynchronously, so this share's copy stays until the
  // next share, which removes it. Keep it in the OS-managed cache.
  removeOldShares();
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
