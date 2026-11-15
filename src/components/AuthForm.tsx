"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Provider = "google" | "github";

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z" />
    </svg>
  );
}

function GitHubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor">
      <path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6 0-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.6 18.3 5 18.3 5c.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.1 0 4.6-2.8 5.6-5.5 6 .4.3.8 1 .8 2.1v3.1c0 .3.2.7.8.6A12 12 0 0 0 12 .3" />
    </svg>
  );
}

export function AuthForm({
  mode,
  initialError = null,
}: {
  mode: "login" | "signup";
  initialError?: string | null;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(initialError);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

  async function continueWith(provider: Provider) {
    setBusy(true);
    setError(null);
    // The callback must be on the same origin that started sign-in, since the
    // PKCE verifier is stored in a cookie on this origin.
    const { error: authError } = await supabaseBrowser().auth.signInWithOAuth({
      provider,
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    // On success the browser is already navigating to the provider.
    if (authError) {
      setBusy(false);
      setError(authError.message);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setBusy(true);
    setError(null);

    const supabase = supabaseBrowser();
    // The address this page was opened on, so the link returns to the same site
    // (it also holds the PKCE cookie the callback needs).
    const site = window.location.origin;
    const { data, error: authError } = signup
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: String(form.get("name")) },
            emailRedirectTo: `${site}/auth/callback`,
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    setBusy(false);
    if (authError) {
      setError(authError.message);
    } else if (signup && data.user && data.user.identities?.length === 0) {
      // Supabase answers this way when the email already belongs to an account,
      // for example one first created with Google or GitHub.
      setError(
        "An account with this email already exists. Sign in with your password, or continue with Google or GitHub.",
      );
    } else if (signup && !data.session) {
      setNotice(`Check ${email} for a link to confirm your account.`);
    } else {
      router.replace("/calendar");
      router.refresh();
    }
  }

  return (
    <main className="auth">
      <div className="auth-bands" aria-hidden="true">
        <div className="auth-brand-statement">
          <div className="auth-brand-mark">
            <span className="auth-brand-logo">
              <Image src="/logo.png" alt="" width={38} height={38} priority />
            </span>
            <span>
              <span className="auth-brand-name">DTA-Cal</span>
              <br />
              <span className="auth-brand-tag">PLAN · TRACK · SHIP</span>
            </span>
          </div>
          <h2>Plan it. Track it. Ship it.</h2>
          <p>Projects, milestones, tasks, docs and whiteboards for your team, with AI that only works when you ask.</p>
        </div>

        {[
          { kind: "task", text: "Milestone · Course beta launch", width: "78%", left: "0%" },
          { kind: "event", text: "Sprint review · Thursday 3pm", width: "56%", left: "18%" },
          { kind: "tool", text: "API spec doc · 12 backlinks", width: "64%", left: "30%" },
          { kind: "prompt", text: "Whiteboard · Signup flow", width: "44%", left: "8%" },
          { kind: "task", text: "Ship v2.0 to production", width: "66%", left: "24%" },
        ].map((b, i) => (
          <span key={i} className={`band band-${b.kind}`} style={{ width: b.width, marginLeft: b.left }}>
            <span>{b.text}</span>
          </span>
        ))}
      </div>

      <section className="auth-panel">
        <Link href="/" className="auth-logo-badge" aria-label="DTA-Cal home">
          <Image
            src="/logo.png"
            alt=""
            width={40}
            height={40}
            className="auth-logo-img"
          />
          <h1 className="wordmark">DTA-Cal</h1>
        </Link>

        <p className="auth-lede">
          {signup
            ? "Create your account, then start an organization or join your team."
            : "Sign in to see what your team has on."}
        </p>

        {notice ? (
          <p className="notice" role="status">
            {notice}
          </p>
        ) : (
          <div className="stack">
          <div className="oauth-buttons">
            <button type="button" className="btn oauth-btn" disabled={busy} onClick={() => continueWith("google")}>
              <GoogleMark />
              <span>Continue with Google</span>
            </button>
            <button type="button" className="btn oauth-btn" disabled={busy} onClick={() => continueWith("github")}>
              <GitHubMark />
              <span>Continue with GitHub</span>
            </button>
          </div>
          <p className="auth-divider">
            <span>or with email</span>
          </p>
          <form onSubmit={submit} className="stack">
            {signup && (
              <label className="field">
                Your name
                <input
                  name="name"
                  required
                  maxLength={80}
                  autoComplete="name"
                  placeholder="e.g. Maya Lin"
                />
              </label>
            )}
            <label className="field">
              Email
              <input
                name="email"
                type="email"
                required
                autoComplete="email"
                placeholder="name@company.com"
              />
            </label>
            <label className="field">
              Password
              <input
                name="password"
                type="password"
                required
                minLength={8}
                autoComplete={signup ? "new-password" : "current-password"}
                placeholder="Minimum 8 characters"
              />
            </label>
            {!signup && (
              <Link href="/forgot-password" className="auth-forgot">
                Forgot your password?
              </Link>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy} style={{ minHeight: 44, fontSize: 15 }}>
              <span>{signup ? "Create account" : "Sign in"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
          </div>
        )}

        <p className="auth-switch">
          {signup ? "Already have an account? " : "New to DTA-Cal? "}
          <Link href={signup ? "/login" : "/signup"}>
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
