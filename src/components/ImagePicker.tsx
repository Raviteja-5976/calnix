"use client";

/* eslint-disable @next/next/no-img-element -- previews are local object URLs */
import { useEffect, useRef, useState } from "react";
import { ImagePlus, X } from "lucide-react";
import { compressImage } from "@/lib/compress-image";

/**
 * Picks an image and shrinks it to WebP under 250 KB in the browser, so the
 * upload is small before it ever leaves the device.
 */
export function ImagePicker({
  value,
  onChange,
  label = "Cover image",
}: {
  value: Blob | null;
  onChange: (blob: Blob | null) => void;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return;
    const url = URL.createObjectURL(value);
    queueMicrotask(() => setPreview(url));
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      onChange(await compressImage(file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not use that image.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div className="field image-picker">
      <span>{label}</span>
      {value && preview ? (
        <div className="image-picker-preview">
          <img src={preview} alt="" />
          <span className="hint">{Math.round(value.size / 1000)} KB · ready to upload</span>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => {
              onChange(null);
              setPreview(null);
            }}
          >
            <X size={13} />
            <span>Remove</span>
          </button>
        </div>
      ) : (
        <button type="button" className="btn image-picker-drop" onClick={() => input.current?.click()} disabled={busy}>
          <ImagePlus size={16} />
          <span>{busy ? "Shrinking…" : "Upload an image"}</span>
          <small className="hint">Shrunk to under 250 KB automatically</small>
        </button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => pick(e.target.files?.[0])}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** Sends an already-shrunk image to the item's upload endpoint. */
export async function uploadItemImage(itemId: string, blob: Blob) {
  const form = new FormData();
  form.append("file", blob, `cover.${blob.type === "image/png" ? "png" : "webp"}`);
  const response = await fetch(`/api/items/${itemId}/image`, { method: "POST", body: form });
  if (!response.ok) {
    throw new Error((await response.json().catch(() => ({}))).error ?? "Could not upload the image.");
  }
}
