import { after, NextResponse } from "next/server";
import { claimCover, generateCover } from "@/lib/generate";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 300;

/** Starts AI cover art for an item. Only ever called when someone clicks "Generate cover". */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  let claim: Awaited<ReturnType<typeof claimCover>>;
  try {
    claim = await claimCover(id);
  } catch {
    return NextResponse.json({ error: "You cannot change this item" }, { status: 403 });
  }
  if (claim === "disabled") {
    return NextResponse.json({ error: "An admin has turned AI off for this organization." }, { status: 403 });
  }
  if (claim === "limited") {
    return NextResponse.json({ error: "You reached the hourly AI limit. Try again later." }, { status: 429 });
  }
  if (claim === "started") after(() => generateCover(id));
  return NextResponse.json({ claim });
}
