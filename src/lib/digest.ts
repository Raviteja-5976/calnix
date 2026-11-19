import { esc, sendMail, siteUrl } from "@/lib/mailer";
import { localParts, startOfLocalDay } from "@/lib/digest-time";
import { supabaseAdmin } from "@/lib/supabase/server";

/**
 * The daily summary email: open tasks assigned to you, unread chats, and
 * what changed today. Server only; uses the service role, so every query
 * below is scoped to the one user explicitly.
 */

interface TaskRow {
  id: string;
  title: string;
  status: string;
  priority: string;
  start_date: string | null;
  end_date: string | null;
  project_id: string | null;
}

interface ChatRow {
  conversation_id: string;
  kind: "dm" | "group" | "team";
  name: string | null;
  other_name: string | null;
  unread: number;
  last_body: string | null;
}

interface ChangeRow {
  kind: string;
  actor_id: string | null;
  title: string;
  body: string | null;
  link: string;
  created_at: string;
}

export interface DigestData {
  name: string;
  localDate: string;
  overdue: (TaskRow & { project?: string })[];
  today: (TaskRow & { project?: string })[];
  upcoming: (TaskRow & { project?: string })[];
  chats: ChatRow[];
  changes: (ChangeRow & { actor: string })[];
}

const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Who gets emails (summary and notifications): the sign-in email if switched on, and confirmed extras. */
export async function emailRecipients(userId: string) {
  const db = supabaseAdmin();
  const [{ data: user }, { data: settings }, { data: extras }] = await Promise.all([
    db.auth.admin.getUserById(userId),
    db.from("user_settings").select("digest_primary").eq("user_id", userId).maybeSingle(),
    db.from("user_emails").select("email").eq("user_id", userId).eq("receives_digest", true).not("verified_at", "is", null),
  ]);
  const list: string[] = [];
  const primary = user?.user?.email;
  if (primary && (settings?.digest_primary ?? true)) list.push(primary);
  for (const row of (extras ?? []) as { email: string }[]) {
    if (!list.some((e) => e.toLowerCase() === row.email.toLowerCase())) list.push(row.email);
  }
  return list;
}

export async function buildDigest(userId: string, now: Date, zone: string): Promise<DigestData> {
  const db = supabaseAdmin();
  const { date: localDate } = localParts(now, zone);
  const weekAhead = addDays(localDate, 7);

  const [{ data: profile }, { data: tasks }, { data: chats }, { data: changes }] = await Promise.all([
    db.from("profiles").select("full_name").eq("id", userId).maybeSingle(),
    db
      .from("items")
      .select("id, title, status, priority, start_date, end_date, project_id")
      .eq("assignee_id", userId)
      .eq("kind", "task")
      .neq("status", "done")
      .limit(200),
    db.rpc("digest_unread_chats", { p_user: userId }),
    db
      .from("notifications")
      .select("kind, actor_id, title, body, link, created_at")
      .eq("user_id", userId)
      .in("kind", ["project", "team", "mention"])
      .gte("created_at", startOfLocalDay(now, zone).toISOString())
      .order("created_at", { ascending: false })
      .limit(40),
  ]);

  const taskRows = (tasks ?? []) as TaskRow[];
  const changeRows = (changes ?? []) as ChangeRow[];
  const projectIds = [...new Set(taskRows.map((t) => t.project_id).filter(Boolean))] as string[];
  const actorIds = [...new Set(changeRows.map((c) => c.actor_id).filter(Boolean))] as string[];
  const [{ data: projects }, { data: actors }] = await Promise.all([
    projectIds.length ? db.from("projects").select("id, name").in("id", projectIds) : Promise.resolve({ data: [] }),
    actorIds.length ? db.from("profiles").select("id, full_name").in("id", actorIds) : Promise.resolve({ data: [] }),
  ]);
  const projectName = new Map(((projects ?? []) as { id: string; name: string }[]).map((p) => [p.id, p.name]));
  const actorName = new Map(((actors ?? []) as { id: string; full_name: string }[]).map((p) => [p.id, p.full_name]));

  const due = (t: TaskRow) => t.end_date ?? t.start_date;
  const withProject = (t: TaskRow) => ({ ...t, project: t.project_id ? projectName.get(t.project_id) : undefined });
  const dated = taskRows.filter((t) => due(t)).sort((a, b) => due(a)!.localeCompare(due(b)!));

  return {
    name: (profile as { full_name: string } | null)?.full_name ?? "there",
    localDate,
    overdue: dated.filter((t) => due(t)! < localDate).slice(0, 15).map(withProject),
    today: dated.filter((t) => due(t) === localDate).slice(0, 15).map(withProject),
    upcoming: dated.filter((t) => due(t)! > localDate && due(t)! <= weekAhead).slice(0, 15).map(withProject),
    chats: ((chats ?? []) as ChatRow[]).slice(0, 15),
    changes: changeRows.map((c) => ({ ...c, actor: c.actor_id ? actorName.get(c.actor_id) ?? "Someone" : "Someone" })),
  };
}

const prettyDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export function renderDigest(d: DigestData) {
  const base = siteUrl();
  const chatName = (c: ChatRow) => (c.kind === "dm" ? c.other_name ?? "Direct message" : c.name ?? "Group");
  const unreadTotal = d.chats.reduce((sum, c) => sum + c.unread, 0);
  const taskTotal = d.overdue.length + d.today.length;
  const subject = `Your day in DTA-Cal: ${taskTotal} task${taskTotal === 1 ? "" : "s"} due, ${unreadTotal} unread message${unreadTotal === 1 ? "" : "s"}`;

  const section = (title: string, rows: string[], empty: string) => `
    <tr><td style="padding:22px 0 6px;font:700 15px/1.3 Arial,sans-serif;color:#1B1F3B">${esc(title)}</td></tr>
    <tr><td style="font:14px/1.5 Arial,sans-serif;color:#3E4468">
      ${rows.length ? `<ul style="margin:0;padding-left:18px">${rows.join("")}</ul>` : `<p style="margin:0;color:#6b7080">${esc(empty)}</p>`}
    </td></tr>`;
  const li = (html: string) => `<li style="margin:0 0 6px">${html}</li>`;
  const link = (path: string, text: string) =>
    `<a href="${esc(base + path)}" style="color:#E2531C;text-decoration:none;font-weight:700">${esc(text)}</a>`;
  const taskLine = (t: DigestData["today"][number], showDate: boolean, overdue = false) =>
    li(
      `${overdue ? '<strong style="color:#C2256E">Overdue:</strong> ' : ""}${link("/tasks", t.title)}${t.project ? ` <span style="color:#6b7080">· ${esc(t.project)}</span>` : ""}` +
        `${showDate ? ` <span style="color:#6b7080">· due ${esc(shortDate((t.end_date ?? t.start_date)!))}</span>` : ""}` +
        `${t.priority === "high" || t.priority === "urgent" ? ` <strong style="color:#C2256E">${esc(t.priority)}</strong>` : ""}`,
    );

  const taskRows = [
    ...d.overdue.map((t) => taskLine(t, true, true)),
    ...d.today.map((t) => taskLine(t, false)),
  ];

  const html = `<!doctype html><html><body style="margin:0;background:#FFF8F0">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8F0;padding:24px 12px">
  <tr><td align="center">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:2px solid #1B1F3B;border-radius:12px;padding:24px 28px">
    <tr><td style="font:800 22px/1.2 Arial,sans-serif;color:#1B1F3B">Good day, ${esc(d.name.split(" ")[0])}</td></tr>
    <tr><td style="padding-top:4px;font:14px Arial,sans-serif;color:#6b7080">${esc(prettyDate(d.localDate))}</td></tr>
    ${section("Due today and overdue", taskRows, "Nothing due today. Nice.")}
    ${section("Coming up this week", d.upcoming.map((t) => taskLine(t, true)), "Nothing due in the next 7 days.")}
    ${section(
      `Unread messages${unreadTotal ? ` (${unreadTotal})` : ""}`,
      d.chats.map((c) =>
        li(`${link(`/chat?c=${c.conversation_id}`, chatName(c))} <span style="color:#6b7080">· ${c.unread} unread</span>` +
          (c.last_body ? `<br><span style="color:#6b7080">“${esc(c.last_body)}”</span>` : "")),
      ),
      "You're all caught up.",
    )}
    ${section(
      "Changes today",
      d.changes.map((c) =>
        li(
          c.kind === "mention"
            ? `<strong>${esc(c.actor)}</strong> mentioned you in ${link(c.link, c.title)}`
            : `<strong>${esc(c.actor)}</strong> ${esc(c.body ?? "")} <span style="color:#6b7080">· ${link(c.link, c.title)}</span>`,
        ),
      ),
      "No changes in your projects or teams so far today.",
    )}
    <tr><td style="padding-top:26px;font:12px/1.5 Arial,sans-serif;color:#6b7080">
      ${link("/calendar", "Open DTA-Cal")} · Change the time or turn this off in your ${link("/profile", "profile")}.
    </td></tr>
  </table></td></tr></table></body></html>`;

  const lines = [
    `Good day, ${d.name.split(" ")[0]} — ${prettyDate(d.localDate)}`,
    "",
    "DUE TODAY AND OVERDUE",
    ...(d.overdue.length || d.today.length
      ? [...d.overdue.map((t) => `- Overdue: ${t.title}`), ...d.today.map((t) => `- ${t.title}`)]
      : ["Nothing due today."]),
    "",
    "COMING UP THIS WEEK",
    ...(d.upcoming.length ? d.upcoming.map((t) => `- ${t.title} (due ${shortDate((t.end_date ?? t.start_date)!)})`) : ["Nothing due in the next 7 days."]),
    "",
    `UNREAD MESSAGES (${unreadTotal})`,
    ...(d.chats.length ? d.chats.map((c) => `- ${chatName(c)}: ${c.unread} unread`) : ["You're all caught up."]),
    "",
    "CHANGES TODAY",
    ...(d.changes.length
      ? d.changes.map((c) => (c.kind === "mention" ? `- ${c.actor} mentioned you in ${c.title}` : `- ${c.actor} ${c.body ?? ""} (${c.title})`))
      : ["No changes so far today."]),
    "",
    `Open DTA-Cal: ${base}/calendar`,
    `Change or turn off this email: ${base}/profile`,
  ];

  return { subject, html, text: lines.join("\n") };
}

/** Builds and sends one person's summary. Returns who it went to. */
export async function sendDigest(userId: string, now: Date, zone: string) {
  const to = await emailRecipients(userId);
  if (!to.length) return [];
  const message = renderDigest(await buildDigest(userId, now, zone));
  // One email per address, so recipients don't see each other.
  for (const address of to) await sendMail({ to: address, ...message });
  return to;
}
