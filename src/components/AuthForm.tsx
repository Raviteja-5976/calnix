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
    const site = process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
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
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
            <div
              style={{
                width: 48,
                height: 48,
                borderRadius: 10,
                background: "#252822",
                border: "1px solid #383B33",
                display: "grid",
                placeItems: "center",
                boxShadow: "2px 2px 0px rgba(0,0,0,0.3)",
              }}
            >
              <Image
                src="/logo.png"
                alt="Calnix Logo"
                width={36}
                height={36}
                priority
              />
            </div>
            <div>
              <h2 style={{ margin: 0, lineHeight: 1 }}>Calnix</h2>
              <span
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: 12,
                  color: "var(--citron)",
                  letterSpacing: "0.05em",
                }}
              >
                PRODUCTIVITY SUITE
              </span>
            </div>
          </div>
          <h2>Less noise. More time.</h2>
          <p>
            Editorial Minimalism × Soft Brutalism × Swiss Grid. Designed for focused teams who value clarity over clutter.
          </p>
        </div>

        <span className="band band-task" style={{ width: "76%" }}>
          <span style={{ padding: "0 12px", lineHeight: "50px", fontSize: 13, fontWeight: 600 }}>
            Sprint Planning · Q4 Roadmap
          </span>
        </span>
        <span
          className="band band-event band-hatch"
          style={{ width: "52%", marginLeft: "20%" }}
        >
          <span style={{ padding: "0 12px", lineHeight: "50px", fontSize: 13, fontWeight: 600 }}>
            Personal Focus · Design System Audit
          </span>
        </span>
        <span
          className="band band-tool"
          style={{ width: "62%", marginLeft: "34%" }}
        >
          <span style={{ padding: "0 12px", lineHeight: "50px", fontSize: 13, fontWeight: 600 }}>
            Engineering Prompt Engine & Guidelines
          </span>
        </span>
        <span
          className="band band-prompt band-hatch"
          style={{ width: "36%", marginLeft: "10%" }}
        >
          <span style={{ padding: "0 12px", lineHeight: "50px", fontSize: 13, fontWeight: 600 }}>
            Review Architecture
          </span>
        </span>
        <span
          className="band band-task band-hatch"
          style={{ width: "68%", marginLeft: "26%" }}
        >
          <span style={{ padding: "0 12px", lineHeight: "50px", fontSize: 13, fontWeight: 600 }}>
            Release v2.0 Production Deployment
          </span>
        </span>
      </div>

      <section className="auth-panel">
        <Link href="/" className="auth-logo-badge" aria-label="Calnix home">
          <Image
            src="/logo.png"
            alt=""
            width={40}
            height={40}
            className="auth-logo-img"
          />
          <h1 className="wordmark">Calnix</h1>
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
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button className="btn btn-primary" disabled={busy} style={{ minHeight: 42, fontSize: 15 }}>
              <span>{signup ? "Create account" : "Sign in"}</span>
              <ArrowRight size={16} />
            </button>
          </form>
          </div>
        )}

        <p className="auth-switch">
          {signup ? "Already have an account? " : "New to Calnix? "}
          <Link href={signup ? "/login" : "/signup"}>
            {signup ? "Sign in" : "Create an account"}
          </Link>
        </p>
      </section>
    </main>
  );
}
