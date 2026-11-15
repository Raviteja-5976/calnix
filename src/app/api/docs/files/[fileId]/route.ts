import { NextResponse } from "next/server";
import { signedImageUrl } from "@/lib/storage";
import { supabaseServer } from "@/lib/supabase/server";

/** Redirects to a short-lived signed link if RLS lets this user see the file's doc. */
export async function GET(_request: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse(null, { status: 401 });

  const { data } = await supabase.from("doc_files").select("storage_key").eq("id", fileId).maybeSingle();
  if (!data) return new NextResponse(null, { status: 404 });

  const response = NextResponse.redirect(await signedImageUrl(data.storage_key, 3600, "doc-files"), 302);
  response.headers.set("Cache-Control", "private, max-age=1800");
  return response;
}
