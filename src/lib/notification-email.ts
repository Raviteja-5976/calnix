import { emailRecipients } from "@/lib/digest";
import { esc, sendMail, siteUrl } from "@/lib/mailer";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * Emails notifications that are still unread a few minutes after they arrive.
 * Called by the scheduler; one email per person per run.
 *
 * Grouped chat notifications are only emailed once until they're read: new
 * messages update the same notification, and an active chat keeps pushing
 * its time forward, so nobody gets an email per message.
 */

/** Give people a chance to see it in the app first. */
const DELAY_MS = 5 * 60_000;
/** Don't email about things older than this (e.g. after the scheduler was down). */
const MAX_AGE_MS = 24 * 3600_000;

type Preference = "off" | "important" | "all";

export interface Row {
  id: string;
  user_id: string;
  kind: "message" | "project" | "team" | "mention";
  actor_id: string | null;
  title: string;
  body: string | null;
  link: string;
  count: number;
  created_at: string;
}

const isImportant = (n: Row) => n.kind === "mention" || (n.kind === "message" && n.title === "Direct message");

function describe(n: Row, actor: string) {
  if (n.kind === "mention") return { line: `${actor} mentioned you in ${n.title}`, detail: n.body };
  if (n.kind === "message") {
    const where = n.title === "Direct message" ? "sent you a message" : `wrote in ${n.title}`;
    return { line: `${actor} ${where}${n.count > 1 ? ` (${n.count} new)` : ""}`, detail: n.body };
  }
  return { line: `${actor} ${n.body ?? ""}`, detail: n.title };
}

export function renderNotificationEmail(rows: Row[], actors: Map<string, string>) {
  const base = siteUrl();
  const items = rows.map((n) => ({ n, ...describe(n, n.actor_id ? actors.get(n.actor_id) ?? "Someone" : "Someone") }));
  const subject = items.length === 1 ? items[0].line : `${items.length} new notifications in DTA-Cal`;

  const html = `<!doctype html><html><body style="margin:0;background:#FFF8F0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F0;padding:24px 12px">
  <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #1B1F3B;border-radius:12px;padding:22px 26px">
    <tr><td style="font:800 19px/1.3 Arial,sans-serif;color:#1B1F3B;padding-bottom:8px">${esc(
      items.length === 1 ? "New notification" : `${items.length} new notifications`,
    )}</td></tr>
    ${items
      .map(
        ({ n, line, detail }) => `<tr><td style="padding:10px 0;border-top:1px solid #eee;font:14px/1.5 Arial,sans-serif;color:#1B1F3B">
          <a href="${esc(base + n.link)}" style="color:#1B1F3B;text-decoration:none;font-weight:700">${esc(line)}</a>
          ${detail ? `<br><span style="color:#6b7080">${esc(detail)}</span>` : ""}
        </td></tr>`,
      )
      .join("")}
    <tr><td style="padding-top:18px;font:12px/1.5 Arial,sans-serif;color:#6b7080">
      <a href="${esc(base + "/calendar")}" style="color:#E2531C;font-weight:700;text-decoration:none">Open DTA-Cal</a>
      · Choose which notifications you get by email in your
      <a href="${esc(base + "/profile")}" style="color:#E2531C;font-weight:700;text-decoration:none">profile</a>.
    </td></tr>
  </table></td></tr></table></body></html>`;

  const text = [
    ...items.map(({ n, line, detail }) => `- ${line}${detail ? `\n  ${detail}` : ""}\n  ${base}${n.link}`),
    "",
    `Choose which notifications you get by email: ${base}/profile`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendNotificationEmails(now = new Date()) {
  const db = supabaseAdmin();
  const result = { emailed: 0, people: 0, failed: 0 };
  const { data } = await db
    .from("notifications")
    .select("id, user_id, kind, actor_id, title, body, link, count, created_at")
    .is("read_at", null)
    .is("emailed_at", null)
    .lt("created_at", new Date(now.getTime() - DELAY_MS).toISOString())
    .gt("created_at", new Date(now.getTime() - MAX_AGE_MS).toISOString())
    .order("created_at")
    .limit(500);
  const rows = (data ?? []) as Row[];
  if (!rows.length) return result;

  const byUser = new Map<string, Row[]>();
  for (const row of rows) byUser.set(row.user_id, [...(byUser.get(row.user_id) ?? []), row]);

  const userIds = [...byUser.keys()];
  const actorIds = [...new Set(rows.map((r) => r.actor_id).filter(Boolean))] as string[];
  const [{ data: prefs }, { data: actors }] = await Promise.all([
    db.from("user_settings").select("user_id, notify_email").in("user_id", userIds),
    actorIds.length ? db.from("profiles").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
  ]);
  const preference = new Map(((prefs ?? []) as { user_id: string; notify_email: Preference }[]).map((p) => [p.user_id, p.notify_email]));
  const actorName = new Map(((actors ?? []) as { id: string; full_name: string }[]).map((a) => [a.id, a.full_name]));

  for (const [userId, list] of byUser) {
    // Claim them first (also the ones this person doesn't want emailed, so
    // they aren't looked at again). A parallel run that loses the race skips.
    const stamp = new Date().toISOString();
    const { data: claimed } = await db
      .from("notifications")
      .update({ emailed_at: stamp })
      .in("id", list.map((n) => n.id))
      .is("emailed_at", null)
      .is("read_at", null)
      .select("id");
    const claimedIds = new Set(((claimed ?? []) as { id: string }[]).map((c) => c.id));
    const pref = preference.get(userId) ?? "important";
    const wanted = list.filter((n) => claimedIds.has(n.id) && (pref === "all" || (pref === "important" && isImportant(n))));
    if (!wanted.length) continue;

    try {
      const to = await emailRecipients(userId);
      if (!to.length) continue;
      const message = renderNotificationEmail(wanted.reverse(), actorName); // Newest first.
      for (const address of to) await sendMail({ to: address, ...message });
      result.emailed += wanted.length;
      result.people++;
    } catch (failure) {
      console.error("Notification email failed for", userId, failure);
      // Let the next run try again.
      await db.from("notifications").update({ emailed_at: null }).in("id", [...claimedIds]);
      result.failed++;
    }
  }
  return result;
}
