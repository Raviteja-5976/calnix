"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, CheckCircle2, Clock, Mail, Plus, Send, Trash2, UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Avatar, useWorkspace } from "./WorkspaceShell";

interface Settings {
  phone: string | null;
  digest_enabled: boolean;
  digest_time: string;
  timezone: string;
  digest_primary: boolean;
  notify_email: "off" | "important" | "all";
}

const NOTIFY_OPTIONS: { value: Settings["notify_email"]; label: string; hint: string }[] = [
  { value: "important", label: "Mentions and direct messages", hint: "Recommended. Only things addressed to you." },
  { value: "all", label: "All notifications", hint: "Also group chats, project changes and team changes." },
  { value: "off", label: "Off", hint: "Only see notifications in the app." },
];

interface ExtraEmail {
  id: string;
  email: string;
  verified_at: string | null;
  receives_digest: boolean;
}

const browserZone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};

const CONFIRM_MESSAGES: Record<string, { ok: boolean; text: string }> = {
  confirmed: { ok: true, text: "Email confirmed. It can now receive your daily summary." },
  expired: { ok: false, text: "That confirmation link has expired. Send a new one below." },
  invalid: { ok: false, text: "That confirmation link isn't valid. It may have been used already." },
};

export function ProfileView() {
  const { me, userId } = useWorkspace();
  const router = useRouter();
  const params = useSearchParams();
  const confirmNotice = CONFIRM_MESSAGES[params.get("email") ?? ""];

  const [loaded, setLoaded] = useState(false);
  const [primaryEmail, setPrimaryEmail] = useState("");
  const [name, setName] = useState(me.full_name);
  const [phone, setPhone] = useState("");
  const [settings, setSettings] = useState<Settings>({
    phone: null,
    digest_enabled: false,
    digest_time: "08:00",
    timezone: "UTC",
    digest_primary: true,
    notify_email: "important",
  });
  const [emails, setEmails] = useState<ExtraEmail[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const zones = useMemo(() => {
    try {
      return (Intl as unknown as { supportedValuesOf: (k: string) => string[] }).supportedValuesOf("timeZone");
    } catch {
      return [browserZone(), "UTC"];
    }
  }, []);

  const loadEmails = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("user_emails")
      .select("id, email, verified_at, receives_digest")
      .order("created_at");
    setEmails((data ?? []) as ExtraEmail[]);
  }, []);

  useEffect(() => {
    queueMicrotask(async () => {
      const db = supabaseBrowser();
      const [{ data: auth }, { data: row }] = await Promise.all([
        db.auth.getUser(),
        db.from("user_settings").select("phone, digest_enabled, digest_time, timezone, digest_primary, notify_email").maybeSingle(),
      ]);
      setPrimaryEmail(auth.user?.email ?? "");
      if (row) {
        const s = row as Settings;
        setSettings({ ...s, digest_time: s.digest_time.slice(0, 5) });
        setPhone(s.phone ?? "");
      } else {
        setSettings((s) => ({ ...s, timezone: browserZone() }));
      }
      await loadEmails();
      setLoaded(true);
    });
  }, [loadEmails]);

  const saveSettings = useCallback(
    async (next: Settings) => {
      const { error } = await supabaseBrowser()
        .from("user_settings")
        .upsert({ user_id: userId, ...next, updated_at: new Date().toISOString() }, { onConflict: "user_id" });
      if (error) {
        setNotice({ ok: false, text: error.message.includes("phone") ? "Enter a valid phone number." : error.message });
        return false;
      }
      setSettings(next);
      return true;
    },
    [userId],
  );

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    setBusy("details");
    setNotice(null);
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();
    if (!trimmedName) {
      setBusy(null);
      return setNotice({ ok: false, text: "Your name can't be empty." });
    }
    if (trimmedPhone && !/^\+?[0-9][0-9 ()-]{5,22}$/.test(trimmedPhone)) {
      setBusy(null);
      return setNotice({ ok: false, text: "Enter a valid phone number, e.g. +91 98765 43210." });
    }
    const { error } = await supabaseBrowser().from("profiles").update({ full_name: trimmedName.slice(0, 80) }).eq("id", userId);
    const savedSettings = !error && (await saveSettings({ ...settings, phone: trimmedPhone || null }));
    setBusy(null);
    if (error) return setNotice({ ok: false, text: error.message });
    if (savedSettings) {
      setNotice({ ok: true, text: "Profile saved." });
      router.refresh(); // Your name shows across the workspace.
    }
  }

  async function addEmail(event: FormEvent) {
    event.preventDefault();
    setBusy("add");
    setNotice(null);
    const response = await fetch("/api/profile/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: newEmail }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    if (!response.ok) return setNotice({ ok: false, text: data.error ?? "Could not add that email." });
    setNewEmail("");
    setNotice({ ok: true, text: `We sent a confirmation link to ${data.email}. Open it to start using that address.` });
    loadEmails();
  }

  async function resend(row: ExtraEmail) {
    setBusy(row.id);
    const response = await fetch(`/api/profile/emails/${row.id}/resend`, { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    setNotice(response.ok ? { ok: true, text: `New confirmation link sent to ${row.email}.` } : { ok: false, text: data.error ?? "Couldn't send it." });
  }

  async function removeEmail(row: ExtraEmail) {
    if (!window.confirm(`Remove ${row.email} from your account?`)) return;
    await supabaseBrowser().from("user_emails").delete().eq("id", row.id);
    loadEmails();
  }

  async function toggleExtra(row: ExtraEmail, on: boolean) {
    setEmails((list) => list.map((e) => (e.id === row.id ? { ...e, receives_digest: on } : e)));
    await supabaseBrowser().from("user_emails").update({ receives_digest: on }).eq("id", row.id);
  }

  async function sendTest() {
    setBusy("test");
    setNotice(null);
    const response = await fetch("/api/profile/digest-test", { method: "POST" });
    const data = await response.json().catch(() => ({}));
    setBusy(null);
    setNotice(
      response.ok
        ? { ok: true, text: `Summary sent to ${(data.sentTo as string[]).join(", ")}.` }
        : { ok: false, text: data.error ?? "Couldn't send the summary." },
    );
  }

  const recipients =
    (settings.digest_primary ? 1 : 0) + emails.filter((e) => e.verified_at && e.receives_digest).length;
  const shown = notice ?? confirmNotice;

  return (
    <main className="page profile-page">
      <header className="page-head">
        <div className="profile-head">
          <Avatar member={{ ...me, full_name: name || me.full_name }} size={56} />
          <div>
            <h1>{me.full_name}</h1>
            <p className="muted">{primaryEmail || " "}</p>
          </div>
        </div>
      </header>

      {shown && (
        <p className={shown.ok ? "notice notice-ok" : "error"} role={shown.ok ? "status" : "alert"}>
          {shown.ok && <CheckCircle2 size={16} aria-hidden="true" />}
          {shown.text}
        </p>
      )}

      <section className="card profile-card">
        <h2 className="inline-icon">
          <UserRound size={18} /> Your details
        </h2>
        <form className="profile-form" onSubmit={saveDetails}>
          <label className="field">
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required autoComplete="name" />
          </label>
          <label className="field">
            Sign-in email
            <input value={primaryEmail} readOnly disabled aria-describedby="primary-hint" />
            <small id="primary-hint" className="muted small">
              Used to sign in. Add more addresses below to receive emails.
            </small>
          </label>
          <label className="field">
            Phone number
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              maxLength={24}
              autoComplete="tel"
              aria-describedby="phone-hint"
            />
            <small id="phone-hint" className="muted small">
              Only you can see this.
            </small>
          </label>
          <div className="profile-actions">
            <button className="btn btn-primary" disabled={busy === "details" || !loaded}>
              {busy === "details" ? "Saving…" : "Save details"}
            </button>
          </div>
        </form>
      </section>

      <section className="card profile-card">
        <h2 className="inline-icon">
          <Mail size={18} /> Email addresses
        </h2>
        <p className="muted small">
          Add other addresses (work, personal) to get your daily summary and notification emails there too. Each one is
          confirmed with a link before it&apos;s used.
        </p>
        <ul className="email-list">
          <li>
            <span className="email-address">
              <strong>{primaryEmail}</strong>
              <span className="status-pill status-done">Sign-in</span>
            </span>
            <label className="check">
              <input
                type="checkbox"
                checked={settings.digest_primary}
                disabled={!loaded}
                onChange={(e) => saveSettings({ ...settings, digest_primary: e.target.checked })}
              />
              Gets emails
            </label>
          </li>
          {emails.map((row) => (
            <li key={row.id}>
              <span className="email-address">
                <strong>{row.email}</strong>
                {row.verified_at ? (
                  <span className="status-pill status-done">Confirmed</span>
                ) : (
                  <span className="status-pill status-blocked">Waiting for confirmation</span>
                )}
              </span>
              {row.verified_at ? (
                <label className="check">
                  <input type="checkbox" checked={row.receives_digest} onChange={(e) => toggleExtra(row, e.target.checked)} />
                  Gets emails
                </label>
              ) : (
                <button type="button" className="btn btn-small" disabled={busy === row.id} onClick={() => resend(row)}>
                  {busy === row.id ? "Sending…" : "Resend link"}
                </button>
              )}
              <button
                type="button"
                className="btn-plain danger"
                onClick={() => removeEmail(row)}
                aria-label={`Remove ${row.email}`}
                title="Remove"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
        <form className="inline-form" onSubmit={addEmail}>
          <label className="field">
            Add an email
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="you@example.com"
              required
              maxLength={254}
            />
          </label>
          <button className="btn" disabled={busy === "add" || emails.length >= 5}>
            <Plus size={15} />
            <span>{busy === "add" ? "Sending link…" : "Add email"}</span>
          </button>
        </form>
      </section>

      <section className="card profile-card">
        <h2 className="inline-icon">
          <Bell size={18} /> Notification emails
        </h2>
        <p className="muted small">
          When something in your bell is still unread a few minutes later, we email it to you. Several at once arrive as
          one email, and a busy chat sends at most one email until you&apos;ve read it.
        </p>
        <fieldset className="notify-options" disabled={!loaded}>
          <legend className="sr-only">Email me about</legend>
          {NOTIFY_OPTIONS.map((option) => (
            <label key={option.value} className="notify-option">
              <input
                type="radio"
                name="notify_email"
                value={option.value}
                checked={settings.notify_email === option.value}
                onChange={() => saveSettings({ ...settings, notify_email: option.value })}
              />
              <span>
                <strong>{option.label}</strong>
                <small className="muted">{option.hint}</small>
              </span>
            </label>
          ))}
        </fieldset>
        {settings.notify_email !== "off" && recipients === 0 && (
          <p className="muted small">No address is set to receive emails. Tick “Gets emails” on at least one email above.</p>
        )}
      </section>

      <section className="card profile-card">
        <h2 className="inline-icon">
          <Clock size={18} /> Daily summary email
        </h2>
        <p className="muted small">
          Once a day: your tasks due today, overdue and this week, unread messages, and the changes made in your projects
          and teams so far that day.
        </p>
        <label className="switch">
          <input
            type="checkbox"
            checked={settings.digest_enabled}
            disabled={!loaded}
            onChange={(e) => saveSettings({ ...settings, digest_enabled: e.target.checked })}
          />
          <span>{settings.digest_enabled ? "On" : "Off"}</span>
        </label>
        <div className="profile-row">
          <label className="field">
            Send at
            <input
              type="time"
              value={settings.digest_time}
              disabled={!loaded}
              onChange={(e) => e.target.value && saveSettings({ ...settings, digest_time: e.target.value })}
            />
          </label>
          <label className="field">
            Time zone
            <select
              value={settings.timezone}
              disabled={!loaded}
              onChange={(e) => saveSettings({ ...settings, timezone: e.target.value })}
            >
              {!zones.includes(settings.timezone) && <option value={settings.timezone}>{settings.timezone}</option>}
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p className="muted small">
          {settings.digest_enabled
            ? recipients
              ? `Arrives within 5 minutes of ${settings.digest_time} (${settings.timezone.replace(/_/g, " ")}), to ${recipients} address${recipients === 1 ? "" : "es"}.`
              : "No address is set to receive it. Tick “Gets emails” on at least one email above."
            : "Turn it on to get the summary every day."}
        </p>
        <div className="profile-actions">
          <button type="button" className="btn" onClick={sendTest} disabled={busy === "test" || !loaded}>
            <Send size={15} />
            <span>{busy === "test" ? "Sending…" : "Send me one now"}</span>
          </button>
        </div>
      </section>
    </main>
  );
}
