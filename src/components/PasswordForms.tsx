"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

function Frame({ title, lede, children }: { title: string; lede: string; children: React.ReactNode }) {
  return (
    <main className="auth auth-single">
      <section className="auth-panel">
        <Link href="/" className="auth-logo-badge" aria-label="DTA-Cal home">
          <Image src="/logo.png" alt="" width={40} height={40} className="auth-logo-img" />
          <span className="wordmark">DTA-Cal</span>
        </Link>
        <h1 className="auth-title">{title}</h1>
        <p className="auth-lede">{lede}</p>
        {children}
      </section>
    </main>
  );
}

/** Sends a reset link. It lands on /auth/callback, which signs the person in and opens /reset-password. */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email")).trim();
    setBusy(true);
    setError(null);
    const { error: failure } = await supabaseBrowser().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);
    // Same message either way, so the form doesn't reveal who has an account.
    if (failure && failure.status !== 400) setError(failure.message);
    else setSent(email);
  }

  return (
    <Frame title="Reset your password" lede="We'll email you a link to choose a new password.">
      {sent ? (
        <p className="notice" role="status">
          If {sent} has a DTA-Cal account, a reset link is on its way. It works once and expires in an hour.
        </p>
      ) : (
        <form className="stack" onSubmit={submit}>
          <label className="field">
            Email
            <input name="email" type="email" required autoComplete="email" placeholder="name@company.com" />
          </label>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button className="btn btn-primary" disabled={busy}>
            <span>{busy ? "Sending…" : "Send reset link"}</span>
            <ArrowRight size={16} />
          </button>
        </form>
      )}
      <p className="auth-switch">
        Remembered it? <Link href="/login">Sign in</Link>
      </p>
    </Frame>
  );
}

/** Sets a new password for the signed-in person (after a reset link, or to add one to a Google/GitHub account). */
export function ResetPasswordForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const password = String(form.get("password"));
    if (password !== String(form.get("confirm"))) return setError("The two passwords don't match.");
    setBusy(true);
    setError(null);
    const { error: failure } = await supabaseBrowser().auth.updateUser({ password });
    setBusy(false);
    if (failure) return setError(failure.message);
    router.replace("/calendar");
    router.refresh();
  }

  return (
    <Frame
      title="Choose a new password"
      lede="This also adds a password to an account you created with Google or GitHub, so you can sign in either way."
    >
      <form className="stack" onSubmit={submit}>
        <label className="field">
          New password
          <input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        <label className="field">
          Repeat it
          <input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="btn btn-primary" disabled={busy}>
          <span>{busy ? "Saving…" : "Save password"}</span>
          <ArrowRight size={16} />
        </button>
      </form>
    </Frame>
  );
}
