import { emailRecipients } from "@/lib/digest";
import { appUrl, layout, section, smallLink } from "@/lib/email-layout";
import { sendMail, siteUrl } from "@/lib/mailer";
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

  const EYEBROW = { mention: "You were mentioned", message: "New message", project: "Project update", team: "Team update" };
  const one = items.length === 1 ? items[0] : null;
  const footnoteHtml = `You're getting this because it was still unread in DTA-Cal. ${smallLink(
    "/profile",
    "Choose which notifications you get by email",
  )}.`;

  const html = one
    ? layout({
        preheader: one.detail ?? one.line,
        eyebrow: EYEBROW[one.n.kind],
        title: one.line,
        bodyRows: one.detail
          ? section(one.n.kind === "project" || one.n.kind === "team" ? "Where" : "Message", [
              { href: appUrl(one.n.link), title: one.detail },
            ], "")
          : undefined,
        cta: { href: appUrl(one.n.link), label: one.n.kind === "message" || one.n.kind === "mention" ? "Reply in DTA-Cal" : "Open in DTA-Cal" },
        footnoteHtml,
      })
    : layout({
        preheader: items.map((i) => i.line).join(" · "),
        eyebrow: "While you were away",
        title: `${items.length} new notifications`,
        bodyRows: section(
          "Unread",
          items.map(({ n, line, detail }) => ({
            href: appUrl(n.link),
            title: line,
            quote: n.kind === "message" || n.kind === "mention" ? detail ?? undefined : undefined,
            detail: n.kind === "project" || n.kind === "team" ? detail ?? undefined : undefined,
            tag: { text: EYEBROW[n.kind].replace("You were ", ""), tone: n.kind === "mention" ? ("alert" as const) : ("plain" as const) },
          })),
          "",
        ),
        cta: { href: appUrl("/calendar"), label: "Open DTA-Cal" },
        footnoteHtml,
      });

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
