import { NextResponse } from "next/server";
import { signedImageUrl } from "@/lib/storage";
import { supabaseServer } from "@/lib/supabase/server";

/** Redirects to a short-lived signed link if RLS lets this user see the item. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse(null, { status: 401 });

  const { data } = await supabase.from("items").select("image_key").eq("id", id).maybeSingle();
  if (!data?.image_key) return new NextResponse(null, { status: 404 });

  const response = NextResponse.redirect(await signedImageUrl(data.image_key), 302);
  response.headers.set("Cache-Control", "private, max-age=1800");
  return response;
}
