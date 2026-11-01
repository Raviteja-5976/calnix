import { NextResponse } from "next/server";
import { deleteObject } from "@/lib/storage";
import { supabaseServer } from "@/lib/supabase/server";

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  // RLS decides. A row the user may not delete comes back empty.
  const { data, error } = await supabase
    .from("items")
    .delete()
    .eq("id", id)
    .select("image_key");
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data?.length) {
    return NextResponse.json({ error: "Only the owner or an admin can delete this" }, { status: 403 });
  }

  const key = data[0].image_key as string | null;
  if (key) {
    await deleteObject(key).catch((err) => console.error(`Could not delete ${key}:`, err));
  }
  return NextResponse.json({ ok: true });
}
