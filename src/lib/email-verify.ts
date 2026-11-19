import { createHash, randomBytes } from "node:crypto";
import { layout } from "@/lib/email-layout";
import { esc, sendMail, siteUrl } from "@/lib/mailer";

/** Extra emails per account. */
export const MAX_EXTRA_EMAILS = 5;
/** How long a confirmation link works. */
export const TOKEN_HOURS = 48;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export function newToken() {
  const token = randomBytes(32).toString("base64url");
  return {
    token,
    hash: hashToken(token),
    expiresAt: new Date(Date.now() + TOKEN_HOURS * 3600_000).toISOString(),
  };
}

export async function sendConfirmation(email: string, name: string, token: string) {
  const url = `${siteUrl()}/api/profile/emails/verify?token=${encodeURIComponent(token)}`;
  await sendMail({
    to: email,
    subject: "Confirm this email for DTA-Cal",
    text: `${name} added this address to their DTA-Cal account.\n\nConfirm it here (the link works for ${TOKEN_HOURS} hours):\n${url}\n\nIf this wasn't you, ignore this email.`,
    html: layout({
      preheader: `Confirm this address to get DTA-Cal emails here. The link works for ${TOKEN_HOURS} hours.`,
      eyebrow: "Confirm your email",
      title: "Is this your address?",
      intro: [
        `${name} added ${email} to their DTA-Cal account, to get the daily summary and notification emails here.`,
        "Confirm it with one click.",
      ],
      cta: { href: url, label: "Confirm this email" },
      footnoteHtml: `The link works for ${TOKEN_HOURS} hours. If the button doesn't work, paste this into your browser:<br><a href="${esc(
        url,
      )}" style="color:#D94E1F; word-break:break-all;">${esc(url)}</a><br><br>Didn't expect this? Ignore it and nothing will be sent here.`,
    }),
  });
}
