import { NextResponse } from "next/server";
import { sendDigest } from "@/lib/digest";
import { isValidTimeZone } from "@/lib/digest-time";
import { mailConfigured } from "@/lib/mailer";
import { supabaseServer } from "@/lib/supabase/server";

/** Sends today's summary to you right now, without affecting the daily one. */
export async function POST() {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!mailConfigured()) {
    return NextResponse.json({ error: "Email sending isn't set up on this server yet." }, { status: 503 });
  }

  const { data: settings } = await supabase.from("user_settings").select("timezone").eq("user_id", auth.user.id).maybeSingle();
  const zone = settings?.timezone && isValidTimeZone(settings.timezone) ? settings.timezone : "UTC";
  try {
    const sentTo = await sendDigest(auth.user.id, new Date(), zone);
    if (!sentTo.length) {
      return NextResponse.json({ error: "No address is set to receive the summary." }, { status: 400 });
    }
    return NextResponse.json({ sentTo });
  } catch (failure) {
    console.error("Test summary failed", failure);
    return NextResponse.json({ error: "The email couldn't be sent. Check the mail server settings." }, { status: 502 });
  }
}
