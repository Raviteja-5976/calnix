import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_EXTRA_EMAILS, newToken, sendConfirmation } from "@/lib/email-verify";
import { mailConfigured } from "@/lib/mailer";
import { supabaseAdmin, supabaseServer } from "@/lib/supabase/server";

const Body = z.object({ email: z.string().trim().toLowerCase().email().max(254) });

/** Adds an extra email to the signed-in account and sends its confirmation link. */
export async function POST(request: Request) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!mailConfigured()) {
    return NextResponse.json({ error: "Email sending isn't set up on this server yet." }, { status: 503 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  const email = parsed.data.email;
  if (email === auth.user.email?.toLowerCase()) {
    return NextResponse.json({ error: "That's already your sign-in email." }, { status: 400 });
  }

  const db = supabaseAdmin();
  const { data: existing } = await db.from("user_emails").select("email").eq("user_id", auth.user.id);
  const list = (existing ?? []) as { email: string }[];
  if (list.some((e) => e.email.toLowerCase() === email)) {
    return NextResponse.json({ error: "You've already added that email." }, { status: 409 });
  }
  if (list.length >= MAX_EXTRA_EMAILS) {
    return NextResponse.json({ error: `You can add up to ${MAX_EXTRA_EMAILS} extra emails.` }, { status: 400 });
  }

  const { token, hash, expiresAt } = newToken();
  const { data: row, error } = await db
    .from("user_emails")
    .insert({ user_id: auth.user.id, email, token_hash: hash, token_expires_at: expiresAt })
    .select("id, email, verified_at, receives_digest, created_at")
    .single();
  if (error || !row) return NextResponse.json({ error: "Could not add that email." }, { status: 500 });

  const { data: profile } = await db.from("profiles").select("full_name").eq("id", auth.user.id).maybeSingle();
  try {
    await sendConfirmation(email, (profile as { full_name: string } | null)?.full_name ?? "Someone", token);
  } catch (failure) {
    console.error("Confirmation email failed", failure);
    await db.from("user_emails").delete().eq("id", row.id);
    return NextResponse.json({ error: "The confirmation email couldn't be sent. Check the mail server settings." }, { status: 502 });
  }
  return NextResponse.json(row, { status: 201 });
}
