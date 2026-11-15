"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useState } from "react";
import { Archive, ArchiveRestore, ChevronLeft, Edit2, PenTool, Trash2, Target } from "lucide-react";
import { shortDate, today } from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { announceProjectsChanged, progressOf, useProject } from "@/lib/use-projects";
import { PROJECT_STATUS_LABEL, type Item, type Milestone, type Project, type ProjectStatus } from "@/lib/types";
import { ProjectForm } from "../ProjectForm";
import { Avatar, useWorkspace } from "../WorkspaceShell";

interface ProjectData {
  project: Project;
  milestones: Milestone[];
  tasks: Item[];
  reload: () => Promise<void>;
  canEdit: boolean;
}

const ProjectContext = createContext<ProjectData | null>(null);

export function useProjectData() {
  const value = useContext(ProjectContext);
  if (!value) throw new Error("useProjectData must be used inside ProjectShell");
  return value;
}

const TABS = [
  { href: "", label: "Overview" },
  { href: "/board", label: "Board" },
  { href: "/list", label: "List" },
  { href: "/timeline", label: "Timeline" },
];

export function ProjectShell({ id, children }: { id: string; children: React.ReactNode }) {
  const { project, milestones, tasks, loading, missing, reload } = useProject(id);
  const { me, isAdmin, memberById, userId } = useWorkspace();
  const pathname = usePathname();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <div className="page"><p className="muted">Loading project…</p></div>;
  if (missing || !project) {
    return (
      <div className="page empty-state">
        <h1>Project not found</h1>
        <p className="muted">It may have been deleted, or you are not on its team.</p>
        <Link href="/projects" className="btn">
          Back to projects
        </Link>
      </div>
    );
  }

  const canEdit = isAdmin || me.teamIds.includes(project.team_id);
  const canDelete = isAdmin || project.lead_id === userId || project.created_by === userId;
  const { percent, done, total } = progressOf(tasks);
  const lead = memberById(project.lead_id);
  const base = `/projects/${project.id}`;
  const late = project.status !== "done" && project.target_date && project.target_date < today();

  async function setStatus(status: ProjectStatus) {
    const { error: failure } = await supabaseBrowser().from("projects").update({ status }).eq("id", project!.id);
    if (failure) setError(failure.message);
    else reload();
  }

  async function toggleArchive() {
    const { error: failure } = await supabaseBrowser()
      .from("projects")
      .update({ archived_at: project!.archived_at ? null : new Date().toISOString() })
      .eq("id", project!.id);
    if (failure) setError(failure.message);
    else {
      announceProjectsChanged();
      reload();
    }
  }

  async function remove() {
    const { data, error: failure } = await supabaseBrowser().from("projects").delete().eq("id", project!.id).select("id");
    if (failure || !data?.length) return setError(failure?.message ?? "Only the lead, the creator or an admin can delete this.");
    announceProjectsChanged();
    router.push("/projects");
  }

  return (
    <ProjectContext.Provider value={{ project, milestones, tasks, reload, canEdit }}>
      <div className="page project-page" style={{ "--project": project.color } as React.CSSProperties}>
        <Link href="/projects" className="back-link">
          <ChevronLeft size={15} />
          Projects
        </Link>
        <header className="project-head">
          <div className="project-head-main">
            <span className="project-swatch" aria-hidden="true" />
            <div>
              <h1>{project.name}</h1>
              {project.goal && (
                <p className="project-goal">
                  <Target size={15} aria-hidden="true" />
                  <span>{project.goal}</span>
                </p>
              )}
            </div>
          </div>
          <div className="project-head-meta">
            {canEdit ? (
              <select
                className={`status-pill project-${project.status}`}
                value={project.status}
                onChange={(e) => setStatus(e.target.value as ProjectStatus)}
                aria-label="Project status"
              >
                {Object.entries(PROJECT_STATUS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            ) : (
              <span className={`status-pill project-${project.status}`}>{PROJECT_STATUS_LABEL[project.status]}</span>
            )}
            {lead && (
              <span className="inline-icon small">
                <Avatar member={lead} size={22} /> {lead.full_name}
              </span>
            )}
            {(project.start_date || project.target_date) && (
              <span className={`small${late ? " overdue" : ""}`}>
                {project.start_date ? shortDate(project.start_date) : "…"} → {project.target_date ? shortDate(project.target_date) : "…"}
              </span>
            )}
            <div className="progress progress-inline" aria-label={`${percent}% done`}>
              <span style={{ width: `${percent}%` }} />
            </div>
            <strong className="small">
              {percent}% · {done}/{total}
            </strong>
            {canEdit && (
              <button className="btn btn-small" onClick={() => setEditing(true)}>
                <Edit2 size={13} />
                <span>Edit</span>
              </button>
            )}
            {canEdit && (
              <button className="btn btn-small" onClick={toggleArchive}>
                {project.archived_at ? <ArchiveRestore size={13} /> : <Archive size={13} />}
                <span>{project.archived_at ? "Restore" : "Archive"}</span>
              </button>
            )}
            {canDelete && !confirming && (
              <button className="btn btn-small btn-danger" onClick={() => setConfirming(true)}>
                <Trash2 size={13} />
                <span>Delete</span>
              </button>
            )}
            {confirming && (
              <>
                <button className="btn btn-small btn-danger-solid" onClick={remove}>
                  Delete project, tasks and docs
                </button>
                <button className="btn btn-small" onClick={() => setConfirming(false)}>
                  Keep it
                </button>
              </>
            )}
          </div>
        </header>
        {project.archived_at && <p className="notice">This project is archived. Restore it to show it in the projects list again.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <nav className="tabs" aria-label="Project views">
          {TABS.map((tab) => {
            const href = base + tab.href;
            const active = tab.href ? pathname.startsWith(href) : pathname === base;
            return (
              <Link key={tab.label} href={href} aria-current={active ? "page" : undefined}>
                {tab.label}
              </Link>
            );
          })}
          <Link href={`/studio/${project.id}`} className="tab-studio">
            Docs &amp; boards
            <PenTool size={14} aria-hidden="true" />
          </Link>
        </nav>

        <div className="project-body">{children}</div>
      </div>
      {editing && <ProjectForm project={project} onClose={() => setEditing(false)} onSaved={() => (setEditing(false), reload())} />}
    </ProjectContext.Provider>
  );
}
