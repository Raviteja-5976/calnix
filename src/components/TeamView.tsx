"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Check, Copy, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Member, Team } from "@/lib/types";
import { Avatar, useWorkspace } from "./WorkspaceShell";

export function TeamView() {
  const { org, teams, members, isAdmin, me } = useWorkspace();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  async function run(call: PromiseLike<{ error: { message: string } | null }>) {
    const { error: failure } = await call;
    setError(failure?.message ?? null);
    if (!failure) router.refresh();
    return !failure;
  }

  async function createTeam(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const name = String(new FormData(form).get("name"));
    if (await run(supabaseBrowser().rpc("create_team", { p_org: org.id, p_name: name }))) {
      form.reset();
    }
  }

  return (
    <main className="page">
      <header className="page-head">
        <div>
          <h1>{org.name}</h1>
          <p className="muted">
            Everyone on a team sees all of that team&apos;s tasks and events, including personal ones.
          </p>
        </div>
      </header>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="team-list">
        {teams.map((team) => (
          <TeamBlock key={team.id} team={team} run={run} />
        ))}
      </div>

      {isAdmin && (
        <form className="inline-form" onSubmit={createTeam}>
          <label className="field">
            New team
            <input name="name" required maxLength={80} placeholder="e.g. Engineering, Marketing" />
          </label>
          <button className="btn btn-primary">
            <Plus size={15} />
            <span>Create team</span>
          </button>
        </form>
      )}

      <section className="people">
        <h2>Organization members</h2>
        <ul>
          {members.map((m) => (
            <li key={m.id}>
              <Avatar member={m} size={28} />
              <strong>
                {m.full_name}
                {m.id === me.id ? " (you)" : ""}
              </strong>
              {me.role === "owner" && m.role !== "owner" ? (
                <select
                  aria-label={`Role for ${m.full_name}`}
                  value={m.role}
                  onChange={(e) =>
                    run(
                      supabaseBrowser().rpc("set_member_role", {
                        p_org: org.id,
                        p_user: m.id,
                        p_role: e.target.value,
                      })
                    )
                  }
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                </select>
              ) : (
                <span className="muted role">
                  {m.role[0].toUpperCase() + m.role.slice(1)}
                </span>
              )}
              {isAdmin && m.role !== "owner" && m.id !== me.id && (
                <RemoveButton
                  label={`Remove from ${org.name}`}
                  onConfirm={() =>
                    run(
                      supabaseBrowser()
                        .from("org_members")
                        .delete()
                        .eq("org_id", org.id)
                        .eq("user_id", m.id)
                    )
                  }
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function TeamBlock({
  team,
  run,
}: {
  team: Team;
  run: (call: PromiseLike<{ error: { message: string } | null }>) => Promise<boolean>;
}) {
  const { org, members, isAdmin, me } = useWorkspace();
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const onTeam: Member[] = members.filter((m) => m.teamIds.includes(team.id));
  const notOnTeam = members.filter((m) => !m.teamIds.includes(team.id));
  const canSeeCode = isAdmin || me.teamIds.includes(team.id);

  useEffect(() => {
    if (!canSeeCode) return;
    supabaseBrowser()
      .from("team_invites")
      .select("code")
      .eq("team_id", team.id)
      .maybeSingle()
      .then(({ data }: { data: { code: string } | null }) => setCode(data?.code ?? null));
  }, [team.id, canSeeCode]);

  async function rotate() {
    const { data, error } = await supabaseBrowser().rpc("rotate_team_invite", {
      p_team: team.id,
    });
    if (!error) setCode(data as string);
  }

  async function copy() {
    if (!code) return;
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <section className="team-block">
      <h2>{team.name}</h2>
      {code && (
        <div className="invite">
          <span className="muted">Invite code:</span>
          <code>{code}</code>
          <button className="btn btn-small" onClick={copy} title="Copy invite code">
            {copied ? <Check size={13} /> : <Copy size={13} />}
            <span>{copied ? "Copied" : "Copy"}</span>
          </button>
          {isAdmin && (
            <button className="btn btn-small btn-plain" onClick={rotate} title="Generate new code">
              <RefreshCw size={12} />
              <span>Rotate</span>
            </button>
          )}
        </div>
      )}
      <ul className="team-members">
        {onTeam.map((m) => (
          <li key={m.id}>
            <Avatar member={m} size={28} />
            <span>{m.full_name}</span>
            {(isAdmin || m.id === me.id) && (
              <RemoveButton
                label={m.id === me.id ? "Leave team" : `Remove from ${team.name}`}
                onConfirm={() =>
                  run(
                    supabaseBrowser()
                      .from("team_members")
                      .delete()
                      .eq("team_id", team.id)
                      .eq("user_id", m.id)
                  )
                }
              />
            )}
          </li>
        ))}
        {!onTeam.length && <li className="muted">No one on this team yet.</li>}
      </ul>
      {isAdmin && notOnTeam.length > 0 && (
        <label className="field add-member">
          Add someone from {org.name}
          <select
            value=""
            onChange={(e) =>
              e.target.value &&
              run(
                supabaseBrowser().from("team_members").insert({
                  team_id: team.id,
                  org_id: org.id,
                  user_id: e.target.value,
                })
              )
            }
          >
            <option value="">Choose a person</option>
            {notOnTeam.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>
        </label>
      )}
    </section>
  );
}

function RemoveButton({
  label,
  onConfirm,
}: {
  label: string;
  onConfirm: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  return confirming ? (
    <span className="confirm">
      <button className="btn btn-small btn-danger-solid" onClick={onConfirm}>
        {label}
      </button>
      <button className="btn btn-small" onClick={() => setConfirming(false)}>
        Cancel
      </button>
    </span>
  ) : (
    <button
      className="btn btn-small btn-danger"
      onClick={() => setConfirming(true)}
      title={label}
    >
      <Trash2 size={12} />
      <span>{label}</span>
    </button>
  );
}
