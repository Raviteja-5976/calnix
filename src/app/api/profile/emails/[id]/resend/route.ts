import { NextResponse } from "next/server";
import { newToken, sendConfirmation } from "@/lib/email-verify";
import { mailConfigured } from "@/lib/mailer";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

/** Sends a fresh confirmation link for one of your unconfirmed emails. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!mailConfigured()) {
    return NextResponse.json({ error: "Email sending isn't set up on this server yet." }, { status: 503 });
  }

  // RLS: only your own rows come back.
  const { data: row } = await supabase.from("user_emails").select("id, email, verified_at").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "Email not found" }, { status: 404 });
  if (row.verified_at) return NextResponse.json({ error: "That email is already confirmed." }, { status: 400 });

  const { token, hash, expiresAt } = newToken();
  const db = supabaseAdmin();
  await db.from("user_emails").update({ token_hash: hash, token_expires_at: expiresAt }).eq("id", id);
  const { data: profile } = await db.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
  try {
    await sendConfirmation(row.email, (profile as { full_name: string } | null)?.full_name ?? "Someone", token);
  } catch (failure) {
    console.error("Confirmation email failed", failure);
    return NextResponse.json({ error: "The confirmation email couldn't be sent." }, { status: 502 });
  }
  return new NextResponse(null, { status: 204 });
}
