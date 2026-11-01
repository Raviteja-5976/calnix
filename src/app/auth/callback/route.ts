import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";

/** Where the sign-up confirmation email lands. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  if (code) {
    const supabase = await supabaseServer();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL("/calendar", url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=confirm", url.origin));
}
