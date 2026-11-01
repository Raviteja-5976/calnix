import { after, NextResponse } from "next/server";
import { claimGeneration, generateItemAssets } from "@/lib/generate";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 300;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  try {
    const claim = await claimGeneration(id);
    if (claim === "started") after(() => generateItemAssets(id));
    return NextResponse.json({ claim });
  } catch {
    return NextResponse.json({ error: "You cannot change this item" }, { status: 403 });
  }
}
