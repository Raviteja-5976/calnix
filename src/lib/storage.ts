import { supabaseAdmin } from "./supabase/server";

const BUCKET = "item-images";

const bucket = () => supabaseAdmin().storage.from(BUCKET);

export async function putImage(key: string, body: Buffer, contentType: string) {
  const { error } = await bucket().upload(key, body, { contentType });
  if (error) throw error;
}

export async function deleteObject(key: string) {
  const { error } = await bucket().remove([key]);
  if (error) throw error;
}

/** The bucket stays private. Viewers get a short-lived link after an access check. */
export async function signedImageUrl(key: string, expiresIn = 3600) {
  const { data, error } = await bucket().createSignedUrl(key, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
