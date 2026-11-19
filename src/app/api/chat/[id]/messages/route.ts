import { NextResponse } from "next/server";
import { z } from "zod";
import { chatPrefix, conversationForUser, MAX_ATTACHMENTS } from "@/lib/chat-files";
import { headObject, MAX_CHAT_FILE_BYTES } from "@/lib/storage";
import { supabaseAdmin } from "@/lib/supabase/server";
import type { Attachment } from "@/lib/types";

const Body = z.object({
  body: z.string().max(4000).default(""),
  attachments: z
    .array(z.object({ key: z.string().min(1).max(400), name: z.string().trim().min(1).max(200) }))
    .min(1)
    .max(MAX_ATTACHMENTS),
});

/**
 * Step 2 of sending files: saves a message pointing at files already uploaded
 * to this conversation. Size and type come from R2, not from the browser.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await conversationForUser(id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid message" }, { status: 400 });

  const prefix = chatPrefix(access.conversation.org_id, id);
  const attachments: Attachment[] = [];
  for (const file of parsed.data.attachments) {
    if (!file.key.startsWith(prefix) || file.key.includes("..")) {
      return NextResponse.json({ error: "That file doesn't belong to this conversation." }, { status: 400 });
    }
    const stored = await headObject(file.key, "chat-files");
    if (!stored) return NextResponse.json({ error: `“${file.name}” didn't finish uploading.` }, { status: 400 });
    if (stored.size > MAX_CHAT_FILE_BYTES) {
      return NextResponse.json({ error: "Files must be 50 MB or smaller." }, { status: 413 });
    }
    attachments.push({ key: file.key, name: file.name, type: stored.contentType, size: stored.size });
  }

  // Membership was checked above as the user; the service role writes the
  // attachments column, which clients can't set themselves.
  const { data, error } = await supabaseAdmin()
    .from("messages")
    .insert({ conversation_id: id, sender_id: access.userId, body: parsed.data.body.trim(), attachments })
    .select("*")
    .single();
  if (error || !data) return NextResponse.json({ error: "Your message wasn't sent." }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}
