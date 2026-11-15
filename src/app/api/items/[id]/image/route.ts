import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { deleteObject, putImage, readUpload, signedImageUrl } from "@/lib/storage";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

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

async function editableItem(id: string) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: 401 as const };
  const { data: item } = await supabase
    .from("items")
    .select("id, org_id, title, image_key")
    .eq("id", id)
    .maybeSingle();
  if (!item) return { status: 403 as const };
  // Writing the title back unchanged proves, under RLS, that this person may edit the item.
  const { data: editable } = await supabase.from("items").update({ title: item.title }).eq("id", id).select("id");
  if (!editable?.length) return { status: 403 as const };
  return { status: 200 as const, item };
}

/** Uploads a cover the person chose. The browser has already shrunk it below 250 KB. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await editableItem(id);
  if (access.status !== 200) {
    return NextResponse.json({ error: "You cannot change this item" }, { status: access.status });
  }
  const upload = await readUpload(await request.formData());
  if ("error" in upload) return NextResponse.json({ error: upload.error }, { status: 400 });

  const key = `orgs/${access.item.org_id}/items/${id}/${randomUUID()}.${upload.extension}`;
  await putImage(key, upload.body, upload.contentType);
  const { error } = await supabaseAdmin()
    .from("items")
    .update({ image_key: key, image_source: "upload", ai_status: "idle", ai_error: null })
    .eq("id", id);
  if (error) {
    await deleteObject(key).catch(() => undefined);
    return NextResponse.json({ error: "Could not save the image" }, { status: 500 });
  }
  if (access.item.image_key) await deleteObject(access.item.image_key).catch(() => undefined);
  return NextResponse.json({ ok: true });
}

/** Removes the cover, uploaded or generated. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await editableItem(id);
  if (access.status !== 200) {
    return NextResponse.json({ error: "You cannot change this item" }, { status: access.status });
  }
  await supabaseAdmin()
    .from("items")
    .update({ image_key: null, image_source: null, ai_status: "idle", ai_error: null })
    .eq("id", id);
  if (access.item.image_key) await deleteObject(access.item.image_key).catch(() => undefined);
  return NextResponse.json({ ok: true });
}
