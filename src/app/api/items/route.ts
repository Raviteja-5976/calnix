import { after, NextResponse } from "next/server";
import { claimGeneration, generateItemAssets } from "@/lib/generate";
import { itemInput } from "@/lib/item-input";
import { supabaseServer } from "@/lib/supabase/server";
import type { Item } from "@/lib/types";

export const maxDuration = 300;

export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const parsed = itemInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Check the form" }, { status: 400 });
  }

  // Inserted as the user, so RLS decides whether they can add to this team.
  const { data: item, error } = await supabase
    .from("items")
    .insert(parsed.data)
    .select("*")
    .single<Item>();
  if (error || !item) {
    const denied = error?.code === "42501";
    return NextResponse.json(
      { error: denied ? "You are not on this team" : (error?.message ?? "Could not save the item") },
      { status: denied ? 403 : 400 },
    );
  }

  const claim = await claimGeneration(item.id);
  if (claim === "started") after(() => generateItemAssets(item.id));

  return NextResponse.json({ item }, { status: 201 });
}
