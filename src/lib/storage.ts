import { AwsClient } from "aws4fetch";

/**
 * Files live in one private Cloudflare R2 bucket, reached through its
 * S3-compatible API. The two kinds of file are kept apart by prefix:
 *   item-images/<key>   covers for calendar and library items
 *   doc-files/<key>     images inside Markdown docs
 * The keys stored in the database don't include the prefix.
 * Viewers get a short-lived signed link after the app checks their access.
 */
export type Bucket = "item-images" | "doc-files";

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
