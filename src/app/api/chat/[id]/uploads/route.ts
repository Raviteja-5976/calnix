import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { chatPrefix, conversationForUser, keySafeName } from "@/lib/chat-files";
import { MAX_CHAT_FILE_BYTES, presignedUploadUrl, putObject } from "@/lib/storage";

const FileInfo = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.string().max(200).default(""),
  size: z.number().int().positive(),
});

/**
 * Step 1 of sending a file: reserves a storage key in this conversation and
 * returns a link the browser uploads the file to directly.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await conversationForUser(id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const parsed = FileInfo.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid file details" }, { status: 400 });
  if (parsed.data.size > MAX_CHAT_FILE_BYTES) {
    return NextResponse.json({ error: "Files must be 50 MB or smaller." }, { status: 413 });
  }

  const key = `${chatPrefix(access.conversation.org_id, id)}${randomUUID()}/${keySafeName(parsed.data.name)}`;
  return NextResponse.json({
    key,
    uploadUrl: await presignedUploadUrl(key, "chat-files"),
  });
}

/**
 * Fallback when the browser can't reach R2 directly (no CORS rule on the
 * bucket): the file goes through the app instead. Hosts may cap request size
 * well below 50 MB, so large videos need the direct route.
 */
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await conversationForUser(id);
  if ("error" in access) return NextResponse.json({ error: access.error }, { status: access.status });

  const key = new URL(request.url).searchParams.get("key") ?? "";
  if (!key.startsWith(chatPrefix(access.conversation.org_id, id)) || key.includes("..")) {
    return NextResponse.json({ error: "Invalid upload key" }, { status: 400 });
  }
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_CHAT_FILE_BYTES) {
    return NextResponse.json({ error: "Files must be 50 MB or smaller." }, { status: 413 });
  }
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.byteLength) return NextResponse.json({ error: "The file is empty." }, { status: 400 });
  if (body.byteLength > MAX_CHAT_FILE_BYTES) {
    return NextResponse.json({ error: "Files must be 50 MB or smaller." }, { status: 413 });
  }
  await putObject(key, body, request.headers.get("content-type") ?? "", "chat-files");
  return new NextResponse(null, { status: 204 });
}
