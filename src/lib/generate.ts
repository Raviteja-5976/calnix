import { randomUUID } from "node:crypto";
import { describeItem, drawImage, publicAiError } from "./ai";
import { deleteObject, putImage } from "./storage";
import { supabaseServer, supabaseAdmin } from "./supabase/server";
import type { Item } from "./types";

const HOURLY_LIMIT = Number(process.env.AI_HOURLY_LIMIT_PER_USER ?? 30);

/**
 * Asks the database, as the signed-in user, whether this person may start a
 * generation now. Throws if they may not edit the item.
 */
export async function claimGeneration(itemId: string) {
  const supabase = await supabaseServer();
  const { data, error } = await supabase.rpc("claim_item_ai", {
    p_item: itemId,
    p_hourly_limit: HOURLY_LIMIT,
  });
  if (error) throw error;
  return data as "started" | "running" | "limited";
}

/** Creates the description and image, stores the image, and saves the result. */
export async function generateItemAssets(itemId: string): Promise<void> {
  const db = supabaseAdmin();
  const { data: item, error } = await db.from("items").select("*").eq("id", itemId).single<Item>();
  if (error || !item) return;

  try {
    const { description, imagePrompt } = await describeItem(item);

    // A blocked or failed image shouldn't cost the team a good description.
    await db.from("items").update({ ai_description: description }).eq("id", item.id);

    const image = await drawImage(imagePrompt);
    const key = `orgs/${item.org_id}/items/${item.id}/${randomUUID()}.webp`;
    await putImage(key, image, "image/webp");

    const { data: saved, error: saveError } = await db
      .from("items")
      .update({ ai_status: "ready", image_key: key, ai_error: null })
      .eq("id", item.id)
      .select("id");
    if (saveError) throw saveError;

    // Item deleted while generating: don't leave its image behind.
    if (!saved?.length) await deleteObject(key);
    else if (item.image_key) await deleteObject(item.image_key);
  } catch (err) {
    console.error(`AI generation failed for item ${item.id}:`, err);
    await db
      .from("items")
      .update({ ai_status: "failed", ai_error: publicAiError(err) })
      .eq("id", item.id);
  }
}
