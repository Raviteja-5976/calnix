import nodemailer, { type Transporter } from "nodemailer";

/**
 * Sends email through any SMTP server (your own mail server, or a service
 * such as Brevo, Resend or Postmark). Server only. Configure with:
 *   SMTP_HOST, SMTP_PORT (587 STARTTLS or 465 TLS), SMTP_USER, SMTP_PASS,
 *   MAIL_FROM  e.g. "DTA-Cal <noreply@your-domain.com>"
 */
let transport: Transporter | undefined;

export function mailConfigured() {
  return Boolean(process.env.SMTP_HOST && process.env.MAIL_FROM);
}

function transporter() {
  if (!mailConfigured()) {
    throw new Error("Email is not set up: SMTP_HOST and MAIL_FROM are required.");
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" } : undefined,
    // Fail fast instead of hanging a request when the server is unreachable.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  return transport;
}

export async function sendMail(message: { to: string | string[]; subject: string; html: string; text: string }) {
  await transporter().sendMail({ from: process.env.MAIL_FROM, ...message });
}

/** Escapes text for HTML email bodies. */
export const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The app's public address, for links inside emails. */
export const siteUrl = () => (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
