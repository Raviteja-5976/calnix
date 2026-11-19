import { NextResponse } from "next/server";
import { signedFileUrl } from "@/lib/storage";
import { supabaseServer } from "@/lib/supabase/server";
import type { Attachment } from "@/lib/types";

/**
 * Redirects to a short-lived link for one file in a message, if RLS lets this
 * user read the message. `?download=1` saves it instead of opening it.
 */
export async function GET(request: Request, { params }: { params: Promise<{ messageId: string; index: string }> }) {
  const { messageId, index } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse(null, { status: 401 });

  const { data } = await supabase.from("messages").select("attachments").eq("id", messageId).maybeSingle();
  const file = ((data?.attachments ?? []) as Attachment[])[Number(index)];
  if (!file) return new NextResponse(null, { status: 404 });

  const download = new URL(request.url).searchParams.has("download");
  const response = NextResponse.redirect(await signedFileUrl(file.key, "chat-files", file, { download }), 302);
  response.headers.set("Cache-Control", "private, max-age=1800");
  return response;
}
