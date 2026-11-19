import { esc, siteUrl } from "@/lib/mailer";

/**
 * The DTA-Cal email design, shared by every email the app sends. It matches
 * the Supabase auth templates in supabase/templates: cream page, logo and
 * name above a card with a hard navy border and shadow, an orange accent
 * bar, a mono eyebrow, a big headline, and a navy button.
 *
 * Email clients ignore <style> blocks and modern CSS, so everything is
 * tables and inline styles. All text passed in is escaped by these helpers
 * unless it's marked as already-built HTML.
 */

const C = {
  page: "#FFF8F0",
  card: "#FFFEFA",
  navy: "#1B1F3B",
  orange: "#FF6B35",
  orangeText: "#D94E1F",
  body: "#45473F",
  muted: "#77796F",
  faint: "#8D8F84",
  line: "#DCD9CF",
  red: "#C2256E",
  redBg: "#FCE8F0",
  greenBg: "#E3F6EC",
  green: "#0F7B6C",
  chip: "#F4EFE6",
};
const HEAD = "'Space Grotesk', 'Helvetica Neue', Helvetica, Arial, sans-serif";
const BODY = "Inter, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "'Geist Mono', 'SFMono-Regular', Menlo, Consolas, monospace";

/** A full URL for an app path. */
export const appUrl = (path: string) => siteUrl() + path;

export function button(href: string, label: string) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="background-color:${C.navy}; border-radius:6px; box-shadow:3px 3px 0 ${C.orange}; border:2px solid ${C.navy};">
      <a href="${esc(href)}" target="_blank" style="display:inline-block; padding:12px 24px; font-family:${BODY}; font-size:15px; font-weight:600; color:${C.page}; text-decoration:none; border-radius:6px;">${esc(label)} &rarr;</a>
    </td></tr></table>`;
}

/** Small rounded counters for the top of the summary. */
export function stats(items: { label: string; value: number; tone?: "alert" | "good" | "plain" }[]) {
  const cell = ({ label, value, tone = "plain" }: (typeof items)[number]) => {
    const bg = tone === "alert" && value > 0 ? C.redBg : tone === "good" ? C.greenBg : C.chip;
    const fg = tone === "alert" && value > 0 ? C.red : tone === "good" ? C.green : C.navy;
    return `<td width="${Math.floor(100 / items.length)}%" style="padding:0 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="background-color:${bg}; border:2px solid ${C.navy}; border-radius:10px; padding:12px 10px; text-align:center;">
          <div style="font-family:${HEAD}; font-size:26px; font-weight:800; line-height:1; color:${fg};">${value}</div>
          <div style="padding-top:6px; font-family:${MONO}; font-size:10px; letter-spacing:1px; text-transform:uppercase; color:${C.muted};">${esc(label)}</div>
        </td></tr></table>
    </td>`;
  };
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 -4px;"><tr>${items
    .map(cell)
    .join("")}</tr></table>`;
}

export interface RowOptions {
  href: string;
  title: string;
  /** Already-escaped HTML before the title, e.g. rowText("Ravi", true) + " wrote in". */
  leadHtml?: string;
  /** Small grey line under the title. */
  detail?: string;
  /** A quoted snippet, e.g. the last message. */
  quote?: string;
  /** A coloured tag on the right. */
  tag?: { text: string; tone: "alert" | "good" | "plain" };
}

function row(opts: RowOptions, first: boolean) {
  const divider = first ? "" : `border-top:1px solid ${C.line}; `;
  const tone = opts.tag?.tone;
  const tag = opts.tag
    ? `<td align="right" valign="top" style="${divider}padding:12px 14px 12px 0; white-space:nowrap;">
        <span style="display:inline-block; padding:3px 8px; border-radius:999px; font-family:${MONO}; font-size:10px; letter-spacing:0.5px; text-transform:uppercase; background-color:${
          tone === "alert" ? C.redBg : tone === "good" ? C.greenBg : C.chip
        }; color:${tone === "alert" ? C.red : tone === "good" ? C.green : C.navy};">${esc(opts.tag.text)}</span>
      </td>`
    : "";
  // Rows without a tag span both columns so dividers run the full width.
  return `<tr><td${opts.tag ? "" : ' colspan="2"'} style="${divider}padding:12px 14px; font-family:${BODY}; font-size:14px; line-height:1.45; color:${C.body};">
      ${opts.leadHtml ? `${opts.leadHtml} ` : ""}<a href="${esc(opts.href)}" target="_blank" style="color:${C.navy}; font-weight:700; text-decoration:none;">${esc(opts.title)}</a>
      ${opts.detail ? `<div style="padding-top:2px; font-size:12.5px; color:${C.muted};">${esc(opts.detail)}</div>` : ""}
      ${opts.quote ? `<div style="margin-top:6px; padding-left:10px; border-left:3px solid ${C.orange}; font-size:13px; color:${C.body};">${esc(opts.quote)}</div>` : ""}
    </td>${tag}</tr>`;
}

/** A titled block of rows in a bordered box, or a calm empty line. */
export function section(title: string, rows: RowOptions[], empty: string, count?: number) {
  const heading = `<tr><td style="padding:26px 0 8px; font-family:${MONO}; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${C.orangeText};">
      ${esc(title)}${count ? ` <span style="color:${C.faint};">&middot; ${count}</span>` : ""}
    </td></tr>`;
  const body = rows.length
    ? `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:2px solid ${C.navy}; border-radius:10px; border-collapse:separate;">${rows
        .map((r, i) => row(r, i === 0))
        .join("")}</table></td></tr>`
    : `<tr><td style="font-family:${BODY}; font-size:14px; line-height:1.5; color:${C.muted};">${esc(empty)}</td></tr>`;
  return heading + body;
}

/** Escapes plain text for use in leadHtml. */
export const rowText = (text: string, bold = false) =>
  bold ? `<strong style="color:${C.navy};">${esc(text)}</strong>` : esc(text);

/** Wraps content in the full branded email. */
export function layout(opts: {
  /** Shown in the inbox list next to the subject. */
  preheader: string;
  eyebrow: string;
  title: string;
  /** Plain-text paragraphs under the headline. */
  intro?: string[];
  /** Rows of the card built with section() / raw <tr> HTML. */
  bodyRows?: string;
  cta?: { href: string; label: string };
  /** Small print at the bottom of the card. */
  footnote?: string;
  /** Already-built HTML for the footnote (e.g. with links). Wins over footnote. */
  footnoteHtml?: string;
}) {
  const intro = (opts.intro ?? [])
    .map((p, i) => `<p style="margin:${i ? "12px" : "0"} 0 0;">${esc(p)}</p>`)
    .join("");
  const footnote = opts.footnoteHtml ?? (opts.footnote ? esc(opts.footnote) : "");
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
<title>${esc(opts.title)}</title>
</head>
<body style="margin:0; padding:0; background-color:${C.page}; -webkit-text-size-adjust:100%;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; color:${C.page};">${esc(opts.preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${C.page};">
<tr><td align="center" style="padding:36px 14px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;">

  <tr><td style="padding:0 4px 18px;">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
      <td style="vertical-align:middle;"><img src="${esc(appUrl("/logo.png"))}" width="34" height="34" alt="" style="display:block; border:0; border-radius:8px;" /></td>
      <td style="vertical-align:middle; padding-left:10px; font-family:${HEAD}; font-size:21px; font-weight:800; letter-spacing:-0.5px; color:${C.navy};">DTA-Cal</td>
    </tr></table>
  </td></tr>

  <tr><td style="background-color:${C.card}; border:3px solid ${C.navy}; border-radius:16px; box-shadow:6px 6px 0 ${C.navy};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="height:6px; line-height:6px; font-size:0; background-color:${C.orange}; border-radius:13px 13px 0 0;">&nbsp;</td></tr>
      <tr><td style="padding:30px 30px 0; font-family:${HEAD};">
        <p style="margin:0 0 10px; font-family:${MONO}; font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:${C.orangeText};">${esc(opts.eyebrow)}</p>
        <h1 style="margin:0; font-size:28px; line-height:1.15; font-weight:700; letter-spacing:-0.8px; color:${C.navy};">${esc(opts.title)}</h1>
      </td></tr>
      ${intro ? `<tr><td style="padding:14px 30px 0; font-family:${BODY}; font-size:15px; line-height:1.6; color:${C.body};">${intro}</td></tr>` : ""}
      ${opts.bodyRows ? `<tr><td style="padding:6px 30px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${opts.bodyRows}</table></td></tr>` : ""}
      ${opts.cta ? `<tr><td style="padding:28px 30px 4px;">${button(opts.cta.href, opts.cta.label)}</td></tr>` : ""}
      ${
        footnote
          ? `<tr><td style="padding:26px 30px 0;"><div style="height:1px; line-height:1px; font-size:0; background-color:${C.line};">&nbsp;</div></td></tr>
      <tr><td style="padding:14px 30px 26px; font-family:${BODY}; font-size:13px; line-height:1.55; color:${C.muted};">${footnote}</td></tr>`
          : `<tr><td style="padding:0 0 26px;"></td></tr>`
      }
    </table>
  </td></tr>

  <tr><td style="padding:20px 4px 0; font-family:${MONO}; font-size:11px; letter-spacing:1px; color:${C.faint}; text-transform:uppercase;">
    DTA-Cal &middot; Less noise. More time.
  </td></tr>

</table>
</td></tr>
</table>
</body>
</html>`;
}

/** A link styled for small print. */
export const smallLink = (path: string, text: string) =>
  `<a href="${esc(appUrl(path))}" target="_blank" style="color:${C.orangeText}; text-decoration:underline;">${esc(text)}</a>`;
