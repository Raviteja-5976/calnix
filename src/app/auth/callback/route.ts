import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/**
 * Where the sign-up confirmation email and Google/GitHub sign-in land.
 * Supabase links a Google or GitHub sign-in to an existing account with the same
 * verified email, so all three ways in reach the same Calnix account.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/calendar", url.origin));
  }
  // Providers report a cancelled or refused sign-in with ?error=...
  const reason = url.searchParams.has("error") ? "oauth" : "confirm";
  return NextResponse.redirect(new URL(`/login?error=${reason}`, url.origin));
}
