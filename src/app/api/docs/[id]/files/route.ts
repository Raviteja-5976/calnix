import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { deleteObject, putImage, readUpload } from "@/lib/storage";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/** Uploads an image for a Markdown doc. The browser has already shrunk it below 250 KB. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  // RLS: only people who can see the doc's team get a row back.
  const { data: doc } = await supabase.from("documents").select("id, org_id, team_id").eq("id", id).maybeSingle();
  if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const upload = await readUpload(await request.formData());
  if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: 400 });

  const key = `orgs/${doc.org_id}/docs/${doc.id}/${randomUUID()}.${upload.extension}`;
  await putImage(key, upload.body, upload.contentType, "doc-files");
  const { data: file, error } = await supabaseAdmin()
    .from("doc_files")
    .insert({ document_id: doc.id, storage_key: key, created_by: auth.user.id })
    .select("id")
    .single();
  if (error || !file) {
    await deleteObject(key, "doc-files").catch(() => undefined);
    return NextResponse.json({ error: "Could not save the image" }, { status: 500 });
  }
  return NextResponse.json({ url: `/api/docs/files/${file.id}` }, { status: 201 });
}
