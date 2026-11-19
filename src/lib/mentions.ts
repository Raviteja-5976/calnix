/**
 * Mentions in chat messages. While typing, a mention shows as plain "@Label";
 * on send it's stored in the body as a token: @[Label](kind:uuid).
 * The database turns tokens back into "@Label" for previews and notifications.
 */
export type MentionKind = "user" | "task" | "tool" | "prompt";

export interface Mention {
  kind: MentionKind;
  id: string;
  label: string;
}

const TOKEN = /@\[([^\]\n]{1,200})\]\((user|task|tool|prompt):([0-9a-f-]{36})\)/g;

export type Segment = { text: string } | { mention: Mention };

/** Splits a stored message body into plain text and mentions. */
export function parseMentions(body: string): Segment[] {
  const out: Segment[] = [];
  let last = 0;
  for (const match of body.matchAll(TOKEN)) {
    if (match.index > last) out.push({ text: body.slice(last, match.index) });
    out.push({ mention: { label: match[1], kind: match[2] as MentionKind, id: match[3] } });
    last = match.index + match[0].length;
  }
  if (last < body.length) out.push({ text: body.slice(last) });
  return out;
}

/** Labels can't contain the characters the token format uses. */
export const cleanLabel = (label: string) => label.replace(/[[\]\n]/g, " ").replace(/\s+/g, " ").trim().slice(0, 200);

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Turns every "@Label" still in the text for a picked mention into its token.
 * Mentions whose text was deleted are dropped. Longer labels match first, so
 * "@Ravi Teja" wins over "@Ravi".
 */
export function encodeMentions(text: string, picked: Mention[]) {
  if (!picked.length) return text;
  const byLabel = new Map(picked.map((m) => [m.label, m]));
  const labels = [...byLabel.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`@(${labels.join("|")})(?![\\w])`, "g");
  return text.replace(pattern, (whole, label: string) => {
    const m = byLabel.get(label);
    return m ? `@[${m.label}](${m.kind}:${m.id})` : whole;
  });
}

/** The "@query" being typed just before the caret, if any. */
export function mentionQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = /(^|\s)@([^\s@[\]]{0,40})$/.exec(before);
  if (!match) return null;
  return { start: caret - match[2].length - 1, query: match[2] };
}
