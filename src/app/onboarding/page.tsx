"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowRight, Building2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export default function OnboardingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(call: () => PromiseLike<{ error: { message: string } | null }>) {
    setBusy(true);
    setError(null);
    const { error: failure } = await call();
    setBusy(false);
    if (failure) {
      setError(failure.message);
      return;
    }
    router.replace("/calendar");
    router.refresh();
  }

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      supabaseBrowser().rpc("create_organization", {
        p_name: String(form.get("org")),
        p_team_name: String(form.get("team")),
      })
    );
  };

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    run(() =>
      supabaseBrowser().rpc("join_team", { p_code: String(form.get("code")) })
    );
  };

  return (
    <main className="onboarding">
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 8,
            background: "#252822",
            border: "1px solid #383B33",
            display: "grid",
            placeItems: "center",
          }}
        >
          <Image
            src="/logo.png"
            alt="Calnix Logo"
            width={32}
            height={32}
            priority
          />
        </div>
        <div>
          <h1 className="wordmark">Calnix</h1>
          <p className="hint" style={{ letterSpacing: "0.03em" }}>
            LESS NOISE. MORE TIME.
          </p>
        </div>
      </div>

      <p className="auth-lede">
        Your calendar, tasks, and reference library live inside a team. Join your team with an invite
        code, or create a new organization.
      </p>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="onboarding-grid">
        <form onSubmit={join} className="stack">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Users size={18} style={{ color: "var(--citron-dark)" }} />
            <h2>Join your team</h2>
          </div>
          <p className="muted">Ask a teammate for the invite code found on their Team page.</p>
          <label className="field">
            Invite code
            <input
              name="code"
              required
              maxLength={12}
              autoComplete="off"
              placeholder="e.g. 7X9K2P"
              style={{ fontFamily: "var(--font-data)", letterSpacing: "0.1em" }}
            />
          </label>
          <button className="btn btn-primary" disabled={busy}>
            <span>Join team</span>
            <ArrowRight size={15} />
          </button>
        </form>

        <form onSubmit={create} className="stack">
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Building2 size={18} style={{ color: "var(--carbon)" }} />
            <h2>Start an organization</h2>
          </div>
          <p className="muted">
            You will become the organization owner and can invite teammates and add more teams.
          </p>
          <label className="field">
            Organization name
            <input name="org" required maxLength={80} placeholder="e.g. Acme Studio" />
          </label>
          <label className="field">
            First team
            <input name="team" required maxLength={80} placeholder="e.g. Product Design" />
          </label>
          <button className="btn" disabled={busy}>
            <span>Create organization</span>
            <ArrowRight size={15} />
          </button>
        </form>
      </div>
    </main>
  );
}
