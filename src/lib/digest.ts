import { appUrl, layout, rowText, section, smallLink, stats } from "@/lib/email-layout";
import { sendMail, siteUrl } from "@/lib/mailer";
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

  const first = d.name.split(" ")[0];
  const dueOn = (t: DigestData["today"][number]) => shortDate((t.end_date ?? t.start_date)!);
  const priorityTag = (t: DigestData["today"][number]) =>
    t.priority === "urgent" || t.priority === "high" ? { text: t.priority, tone: "alert" as const } : undefined;
  const taskDetail = (t: DigestData["today"][number], extra?: string) =>
    [t.project, extra].filter(Boolean).join(" · ") || undefined;

  const bodyRows =
    `<tr><td style="padding-top:20px;">${stats([
      { label: "Overdue", value: d.overdue.length, tone: "alert" },
      { label: "Due today", value: d.today.length },
      { label: "Unread", value: unreadTotal },
    ])}</td></tr>` +
    section(
      "Due today & overdue",
      [
        ...d.overdue.map((t) => ({
          href: appUrl("/tasks"),
          title: t.title,
          detail: taskDetail(t, `was due ${dueOn(t)}`),
          tag: { text: "Overdue", tone: "alert" as const },
        })),
        ...d.today.map((t) => ({ href: appUrl("/tasks"), title: t.title, detail: taskDetail(t), tag: priorityTag(t) })),
      ],
      "Nothing due today. Nice.",
      taskTotal,
    ) +
    section(
      "Coming up this week",
      d.upcoming.map((t) => ({
        href: appUrl("/tasks"),
        title: t.title,
        detail: taskDetail(t, `due ${dueOn(t)}`),
        tag: priorityTag(t),
      })),
      "Nothing due in the next 7 days.",
      d.upcoming.length,
    ) +
    section(
      "Unread messages",
      d.chats.map((c) => ({
        href: appUrl(`/chat?c=${c.conversation_id}`),
        title: chatName(c),
        quote: c.last_body ?? undefined,
        tag: { text: `${c.unread} new`, tone: "plain" as const },
      })),
      "You're all caught up.",
      unreadTotal,
    ) +
    section(
      "Changes today",
      d.changes.map((c) =>
        c.kind === "mention"
          ? { href: appUrl(c.link), title: c.title, leadHtml: `${rowText(c.actor, true)} mentioned you in`, quote: c.body ?? undefined }
          : { href: appUrl(c.link), title: c.title, leadHtml: `${rowText(c.actor, true)} ${rowText(c.body ?? "")} ·` },
      ),
      "No changes in your projects or teams so far today.",
      d.changes.length,
    );

  const html = layout({
    preheader: `${taskTotal} due, ${unreadTotal} unread, ${d.changes.length} change${d.changes.length === 1 ? "" : "s"} today.`,
    eyebrow: prettyDate(d.localDate),
    title: `Good day, ${first}.`,
    intro: ["Here's where things stand today."],
    bodyRows,
    cta: { href: appUrl("/calendar"), label: "Open DTA-Cal" },
    footnoteHtml: `You get this every day at the time you chose. ${smallLink("/profile", "Change the time or turn it off")}.`,
  });

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
