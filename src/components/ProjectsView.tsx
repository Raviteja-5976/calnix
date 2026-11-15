"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Archive, CalendarClock, Plus, Target } from "lucide-react";
import { shortDate, today } from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useProjects } from "@/lib/use-projects";
import { PROJECT_STATUS_LABEL, type ProjectStatus } from "@/lib/types";
import { ProjectForm } from "./ProjectForm";
import { Avatar, useWorkspace } from "./WorkspaceShell";

interface Counts {
  done: number;
  total: number;
  overdue: number;
}

export function ProjectsView() {
  const { org, teams, memberById, writableTeams } = useWorkspace();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const { projects, loading } = useProjects(org.id, { archived: showArchived });
  const [counts, setCounts] = useState<Map<string, Counts>>(new Map());
  const [teamFilter, setTeamFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<ProjectStatus | "">("");
  const [creating, setCreating] = useState(false);

  const projectKey = projects.map((p) => p.id).join(",");
  useEffect(() => {
    if (!projectKey) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("items")
        .select("project_id, status, start_date")
        .in("project_id", projectKey.split(","))
        .is("parent_id", null)
        .limit(5000);
      if (cancelled) return;
      const now = today();
      const next = new Map<string, Counts>();
      for (const row of (data ?? []) as { project_id: string; status: string; start_date: string | null }[]) {
        const c = next.get(row.project_id) ?? { done: 0, total: 0, overdue: 0 };
        c.total++;
        if (row.status === "done") c.done++;
        else if (row.start_date && row.start_date < now) c.overdue++;
        next.set(row.project_id, c);
      }
      setCounts(next);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectKey]);

  const visible = useMemo(
    () =>
      projects.filter((p) => (!teamFilter || p.team_id === teamFilter) && (!statusFilter || p.status === statusFilter)),
    [projects, teamFilter, statusFilter],
  );

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Project manager</p>
          <h1>Projects</h1>
        </div>
        <div className="page-actions">
          {teams.length > 1 && (
            <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)} aria-label="Team">
              <option value="">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | "")} aria-label="Status">
            <option value="">Any status</option>
            {Object.entries(PROJECT_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <button className="btn" aria-pressed={showArchived} onClick={() => setShowArchived(!showArchived)}>
            <Archive size={15} />
            <span>{showArchived ? "Showing archived" : "Archived"}</span>
          </button>
          {writableTeams.length > 0 && !showArchived && (
            <button className="btn btn-primary" onClick={() => setCreating(true)}>
              <Plus size={15} />
              <span>New project</span>
            </button>
          )}
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading projects…</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <h2>{showArchived ? "No archived projects" : "No projects yet"}</h2>
          {!showArchived && (
            <>
              <p className="muted">
                A project holds a goal, milestones, tasks, docs and whiteboards. Start blank, from a template, or let AI draft
                the plan.
              </p>
              {writableTeams.length > 0 && (
                <button className="btn btn-primary" onClick={() => setCreating(true)}>
                  <Plus size={15} />
                  <span>Create your first project</span>
                </button>
              )}
            </>
          )}
        </div>
      ) : (
        <ul className="project-grid">
          {visible.map((p) => {
            const c = counts.get(p.id) ?? { done: 0, total: 0, overdue: 0 };
            const percent = c.total ? Math.round((c.done / c.total) * 100) : 0;
            const lead = memberById(p.lead_id);
            const late = p.status !== "done" && p.target_date && p.target_date < today();
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="project-card" style={{ "--project": p.color } as React.CSSProperties}>
                  <div className="project-card-top">
                    <span className={`status-pill project-${p.status}`}>{PROJECT_STATUS_LABEL[p.status]}</span>
                    {teams.length > 1 && <span className="muted small">{teams.find((t) => t.id === p.team_id)?.name}</span>}
                  </div>
                  <h2>{p.name}</h2>
                  {p.goal && (
                    <p className="project-goal">
                      <Target size={14} aria-hidden="true" />
                      <span>{p.goal}</span>
                    </p>
                  )}
                  <div className="progress" aria-label={`${percent}% done`}>
                    <span style={{ width: `${percent}%` }} />
                  </div>
                  <div className="project-card-foot">
                    <span>
                      <strong>{percent}%</strong> · {c.done}/{c.total} tasks
                      {c.overdue > 0 && <em className="overdue"> · {c.overdue} overdue</em>}
                    </span>
                    <span className="inline-icon">
                      {p.target_date && (
                        <span className={late ? "overdue inline-icon" : "inline-icon"}>
                          <CalendarClock size={13} />
                          {shortDate(p.target_date)}
                        </span>
                      )}
                      {lead && <Avatar member={lead} size={22} />}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}

      {creating && (
        <ProjectForm onClose={() => setCreating(false)} onSaved={(id) => router.push(`/projects/${id}`)} />
      )}
    </div>
  );
}
