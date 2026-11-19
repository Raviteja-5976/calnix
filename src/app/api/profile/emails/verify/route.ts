import { NextResponse } from "next/server";
import { hashToken } from "@/lib/email-verify";
import { siteUrl } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The link in a confirmation email. The token is the proof, so this works
 * without being signed in (people often open it on another device).
 */
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const done = (status: string) => NextResponse.redirect(`${siteUrl()}/profile?email=${status}`, 303);
  if (token.length < 20 || token.length > 100) return done("invalid");

  const db = supabaseAdmin();
  const { data: row } = await db
    .from("user_emails")
    .select("id, token_expires_at")
    .eq("token_hash", hashToken(token))
    .maybeSingle();
  if (!row) return done("invalid");
  if (!row.token_expires_at || new Date(row.token_expires_at) < new Date()) return done("expired");

  await db
    .from("user_emails")
    .update({ verified_at: new Date().toISOString(), token_hash: null, token_expires_at: null })
    .eq("id", row.id);
  return done("confirmed");
}
