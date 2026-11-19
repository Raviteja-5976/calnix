import { createHash, randomBytes } from "node:crypto";
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
    html: `<div style="font:15px/1.5 Arial,sans-serif;color:#1B1F3B;max-width:520px">
      <p><strong>${esc(name)}</strong> added this address to their DTA-Cal account.</p>
      <p><a href="${esc(url)}" style="display:inline-block;padding:10px 18px;background:#FF6B35;color:#1B1F3B;font-weight:700;border:2px solid #1B1F3B;border-radius:8px;text-decoration:none">Confirm email</a></p>
      <p style="color:#6b7080;font-size:13px">The link works for ${TOKEN_HOURS} hours. If this wasn't you, ignore this email.</p>
    </div>`,
  });
}
