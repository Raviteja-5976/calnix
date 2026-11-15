
/** Every stored image stays below this size, uploads and AI images alike. */
export const MAX_IMAGE_BYTES = 250_000;

/**
 * Re-encodes an image as WebP until it is under 250 KB: lower quality first,
 * then smaller dimensions. Used for AI images; uploads are already shrunk in
 * the browser and only checked on the server.
 */
export async function shrinkImage(input: Buffer): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const meta = await sharp(input).metadata();
  let width = Math.min(meta.width ?? 1600, 1600);
  if (input.byteLength <= MAX_IMAGE_BYTES && meta.format === "webp" && (meta.width ?? 0) <= 1600) {
    return input;
  }
  for (let round = 0; round < 8; round++) {
    for (const quality of [80, 68, 56, 44]) {
      const out = await sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer();
      if (out.byteLength <= MAX_IMAGE_BYTES) return out;
    }
    width = Math.round(width * 0.8);
  }
  throw new Error("Could not shrink the image below 250 KB");
}
