import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sendDigest } from "@/lib/digest";
import { isDue } from "@/lib/digest-time";
import { mailConfigured } from "@/lib/mailer";
import { sendNotificationEmails } from "@/lib/notification-email";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The scheduled email job: sends every daily summary that's due, then emails
 * notifications still unread after a few minutes. Call it every 5 minutes
 * from a scheduler (Supabase pg_cron, or any cron service) with
 *   Authorization: Bearer <CRON_SECRET>
 * Safe to call more often or twice at once: summaries and notifications are
 * claimed in the database before sending, so nothing is sent twice.
 */
export const maxDuration = 60;

function authorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const wanted = Buffer.from(`Bearer ${secret}`);
  return given.length === wanted.length && timingSafeEqual(given, wanted);
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!mailConfigured()) return NextResponse.json({ error: "Email sending isn't set up" }, { status: 503 });

  const now = new Date();
  // One job failing (e.g. a database hiccup) shouldn't stop the other.
  const [digests, notifications] = await Promise.allSettled([sendDueDigests(now), sendNotificationEmails(now)]);
  const outcome = <T,>(r: PromiseSettledResult<T>) =>
    r.status === "fulfilled" ? r.value : (console.error("Email job failed", r.reason), { error: "failed" });
  return NextResponse.json({ digests: outcome(digests), notifications: outcome(notifications) });
}

async function sendDueDigests(now: Date) {
  const db = supabaseAdmin();
  const { data } = await db
    .from("user_settings")
    .select("user_id, digest_time, timezone, last_digest_on")
    .eq("digest_enabled", true);

  const results = { sent: 0, skipped: 0, failed: 0 };
  for (const row of (data ?? []) as { user_id: string; digest_time: string; timezone: string; last_digest_on: string | null }[]) {
    const { due, localDate, zone } = isDue(row, now);
    if (!due) {
      results.skipped++;
      continue;
    }
    // Claim today's summary first; a parallel run that loses the race skips.
    let claim = db.from("user_settings").update({ last_digest_on: localDate }).eq("user_id", row.user_id);
    claim = row.last_digest_on ? claim.eq("last_digest_on", row.last_digest_on) : claim.is("last_digest_on", null);
    const { data: claimed } = await claim.select("user_id");
    if (!claimed?.length) {
      results.skipped++;
      continue;
    }
    try {
      await sendDigest(row.user_id, now, zone);
      results.sent++;
    } catch (failure) {
      console.error("Daily summary failed for", row.user_id, failure);
      // Release the claim so the next run can try again within the window.
      await db.from("user_settings").update({ last_digest_on: row.last_digest_on }).eq("user_id", row.user_id);
      results.failed++;
    }
  }
  return results;
}

export const GET = run;
export const POST = run;
