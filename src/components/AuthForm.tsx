"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const signup = mode === "signup";

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
        <div className="auth-logo-badge">
          <Image
            src="/logo.png"
            alt="Calnix"
            width={40}
            height={40}
            className="auth-logo-img"
          />
          <h1 className="wordmark">Calnix</h1>
        </div>

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
