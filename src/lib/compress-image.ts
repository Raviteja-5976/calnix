/** Uploads must end up below this many bytes. */
export const MAX_UPLOAD_BYTES = 250_000;

/**
 * Shrinks an image in the browser to WebP under 250 KB: at most 1600px on the
 * long side, then lower quality, then smaller dimensions, until it fits.
 */
export async function compressImage(file: File, maxSide = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(
      /heic|heif/i.test(file.type) || /\.hei[cf]$/i.test(file.name)
        ? "This browser can't read HEIC photos. Convert it to JPG or PNG first."
        : "Could not read that image. Try a JPG, PNG or WebP file.",
    );
  }

  let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  try {
    for (let round = 0; round < 8; round++) {
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("Could not process the image.");
      context.drawImage(bitmap, 0, 0, width, height);
      for (const quality of [0.82, 0.7, 0.58, 0.46]) {
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
        // Old Safari may ignore WebP and return PNG; still accept it if small enough.
        if (blob && blob.size <= MAX_UPLOAD_BYTES) return blob;
      }
      scale *= 0.75;
    }
  } finally {
    bitmap.close();
  }
  throw new Error("Could not shrink this image below 250 KB.");
}

export const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
