"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ChevronLeft } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Project } from "@/lib/types";
import { DocsWorkspace } from "./DocsWorkspace";

type StudioProject = Pick<Project, "id" | "name" | "team_id" | "color">;

/** Full-screen docs and whiteboards for one project: files on the left, the editor everywhere else. */
export function ProjectStudio({ projectId }: { projectId: string }) {
  const [project, setProject] = useState<StudioProject | null | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("projects")
        .select("id, name, team_id, color")
        .eq("id", projectId)
        .maybeSingle();
      if (!cancelled) setProject((data as StudioProject | null) ?? null);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  if (project === undefined) return <p className="muted studio-loading">Loading…</p>;
  if (project === null) {
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

  return (
    <DocsWorkspace
      teamId={project.team_id}
      projectId={project.id}
      sidebarHeader={
        <div className="studio-head" style={{ "--project": project.color } as React.CSSProperties}>
          <Link href={`/projects/${project.id}`} className="back-link">
            <ChevronLeft size={15} />
            Project
          </Link>
          <p className="studio-project">
            <span className="project-swatch" aria-hidden="true" />
            <span>{project.name}</span>
          </p>
        </div>
      }
    />
  );
}
