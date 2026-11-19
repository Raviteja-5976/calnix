import { AwsClient } from "aws4fetch";

/**
 * Files live in one private Cloudflare R2 bucket, reached through its
 * S3-compatible API. The two kinds of file are kept apart by prefix:
 *   item-images/<key>   covers for calendar and library items
 *   doc-files/<key>     images inside Markdown docs
 *   chat-files/<key>    pictures, videos and files sent in chat
 * The keys stored in the database don't include the prefix.
 * Viewers get a short-lived signed link after the app checks their access.
 */
export type Bucket = "item-images" | "doc-files" | "chat-files";

/** Every stored image stays below this size, uploads and AI images alike. */
const MAX_BYTES = 250_000;

const ALLOWED = new Map([
  ["image/webp", "webp"],
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
]);

let client: AwsClient | undefined;

function r2() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error("File storage is not set up: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET are required.");
  }
  client ??= new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
  return { client, base: `https://${accountId}.r2.cloudflarestorage.com/${bucket}` };
}

function objectUrl(key: string, name: Bucket) {
  if (!key || key.includes("..") || key.startsWith("/")) throw new Error("Invalid storage key");
  const { base } = r2();
  return `${base}/${name}/${key.split("/").map(encodeURIComponent).join("/")}`;
}

async function check(response: Response, action: string) {
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new Error(`R2 ${action} failed (${response.status}): ${detail}`);
  }
}

export async function putImage(key: string, body: Buffer, contentType: string, name: Bucket = "item-images") {
  // The bucket can't enforce limits itself, so they are enforced here.
  if (!ALLOWED.has(contentType)) throw new Error(`Refusing to store ${contentType}`);
  if (body.byteLength > MAX_BYTES) throw new Error("Refusing to store an image over 250 KB");
  const response = await r2().client.fetch(objectUrl(key, name), {
    method: "PUT",
    body: new Uint8Array(body),
    headers: {
      "Content-Type": contentType,
      "Content-Length": String(body.byteLength),
      // Keys are unique per upload, so a stored object never changes.
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
  await check(response, "upload");
}

export async function deleteObject(key: string, name: Bucket = "item-images") {
  const response = await r2().client.fetch(objectUrl(key, name), { method: "DELETE" });
  // Already gone is fine.
  if (response.status !== 404) await check(response, "delete");
}

/** A link that works for `expiresIn` seconds and needs no other credentials. */
export async function signedImageUrl(key: string, expiresIn = 3600, name: Bucket = "item-images") {
  const url = new URL(objectUrl(key, name));
  url.searchParams.set("X-Amz-Expires", String(Math.min(expiresIn, 604800)));
  const signed = await r2().client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

/**
 * Reads an uploaded image from a form. The browser has already shrunk it, so
 * anything over 250 KB or of another type is refused rather than re-encoded.
 */
export async function readUpload(form: FormData, field = "file") {
  const file = form.get(field);
  if (!(file instanceof File)) return { error: "Choose an image to upload." } as const;
  const extension = ALLOWED.get(file.type);
  if (!extension) return { error: "Upload a WebP, JPEG or PNG image." } as const;
  if (file.size > MAX_BYTES) return { error: "Images must be under 250 KB." } as const;
  const body = Buffer.from(await file.arrayBuffer());
  return { body, contentType: file.type, extension } as const;
}

/** Chat files are not shrunk, so they get their own, larger limit. */
export const MAX_CHAT_FILE_BYTES = 50 * 1024 * 1024;

/**
 * A link the browser can PUT one file to for `expiresIn` seconds, so large
 * files (videos) go straight to R2 instead of through the app's server.
 * Needs a CORS rule on the bucket allowing PUT from the app's origin.
 */
export async function presignedUploadUrl(key: string, name: Bucket, expiresIn = 900) {
  const url = new URL(objectUrl(key, name));
  url.searchParams.set("X-Amz-Expires", String(expiresIn));
  const signed = await r2().client.sign(url.toString(), { method: "PUT", aws: { signQuery: true } });
  return signed.url;
}

/** Stores any file as-is. The caller checks size and type. */
export async function putObject(key: string, body: Uint8Array<ArrayBuffer>, contentType: string, name: Bucket) {
  const response = await r2().client.fetch(objectUrl(key, name), {
    method: "PUT",
    body,
    headers: {
      "Content-Type": contentType || "application/octet-stream",
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, max-age=31536000, immutable",
    },
  });
  await check(response, "upload");
}

/** Size and type of a stored object, or null if it isn't there. */
export async function headObject(key: string, name: Bucket) {
  const response = await r2().client.fetch(objectUrl(key, name), { method: "HEAD" });
  if (response.status === 404) return null;
  await check(response, "lookup");
  return {
    size: Number(response.headers.get("Content-Length") ?? 0),
    contentType: response.headers.get("Content-Type") ?? "application/octet-stream",
  };
}

/**
 * A short-lived download link. Files that aren't pictures, video or audio are
 * always downloaded rather than opened, and `download` forces that for any file.
 */
export async function signedFileUrl(
  key: string,
  name: Bucket,
  file: { name: string; type: string },
  options: { download?: boolean; expiresIn?: number } = {},
) {
  const media = /^(image\/(png|jpeg|gif|webp|avif)|video\/|audio\/)/.test(file.type);
  const disposition = options.download || !media ? "attachment" : "inline";
  const ascii = file.name.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  const url = new URL(objectUrl(key, name));
  url.searchParams.set("X-Amz-Expires", String(options.expiresIn ?? 3600));
  url.searchParams.set(
    "response-content-disposition",
    `${disposition}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
  );
  if (!media) url.searchParams.set("response-content-type", "application/octet-stream");
  const signed = await r2().client.sign(url.toString(), { method: "GET", aws: { signQuery: true } });
  return signed.url;
}
