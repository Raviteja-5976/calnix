/** Browser side of sending files in chat. Limits match the server's. */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
export const MAX_FILES = 10;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export const fileKind = (type: string) =>
  type.startsWith("image/") ? "image" : type.startsWith("video/") ? "video" : type.startsWith("audio/") ? "audio" : "file";

/** Thrown when the request never got an answer (offline, or blocked by CORS). */
class NetworkError extends Error {}

function put(url: string, file: File, onProgress: (sent: number) => void) {
  return new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.upload.onprogress = (event) => onProgress(event.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      let message = `Upload failed (${xhr.status}).`;
      if (xhr.status === 413) message = `“${file.name}” is too large to upload here.`;
      try {
        message = JSON.parse(xhr.responseText).error ?? message;
      } catch {
        // Not JSON (R2 answers in XML): keep the generic message.
      }
      reject(new Error(message));
    };
    xhr.onerror = () => reject(new NetworkError("Network error"));
    xhr.send(file);
  });
}

/**
 * Uploads one file to a conversation and returns what the message needs.
 * Tries R2 directly first; if the bucket has no CORS rule for this site the
 * browser blocks that, and the file goes through the app instead.
 */
export async function uploadChatFile(conversationId: string, file: File, onProgress: (sent: number) => void) {
  const reserve = await fetch(`/api/chat/${conversationId}/uploads`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: file.name, type: file.type, size: file.size }),
  });
  const slot = (await reserve.json().catch(() => ({}))) as { key?: string; uploadUrl?: string; error?: string };
  if (!reserve.ok || !slot.key || !slot.uploadUrl) throw new Error(slot.error ?? "Could not start the upload.");

  try {
    await put(slot.uploadUrl, file, onProgress);
  } catch (failure) {
    if (!(failure instanceof NetworkError)) throw failure;
    onProgress(0);
    try {
      await put(`/api/chat/${conversationId}/uploads?key=${encodeURIComponent(slot.key)}`, file, onProgress);
    } catch (second) {
      if (second instanceof NetworkError) throw new Error(`“${file.name}” couldn't be uploaded. Check your connection.`);
      throw second;
    }
  }
  return { key: slot.key, name: file.name };
}
