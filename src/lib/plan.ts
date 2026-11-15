"use client";

import { supabaseBrowser } from "./supabase/browser";
import type { Priority, Project } from "./types";

export interface DraftTask {
  title: string;
  details?: string | null;
  priority: Priority;
  due_date: string | null;
  keep: boolean;
}

export interface DraftMilestone {
  title: string;
  description?: string | null;
  due_date: string | null;
  keep: boolean;
  tasks: DraftTask[];
}

/**
 * Creates the kept milestones and tasks of a reviewed plan, appending after
 * what the project already has. Returns how many of each were created.
 */
export async function commitPlan(
  project: Project,
  plan: { milestones?: DraftMilestone[]; tasks?: DraftTask[]; milestoneId?: string | null },
  startPosition = 0,
) {
  const db = supabaseBrowser();
  let milestones = 0;
  let tasks = 0;

  const insertTasks = async (list: DraftTask[], milestoneId: string | null) => {
    const rows = list
      .filter((t) => t.keep && t.title.trim())
      .map((t, i) => ({
        team_id: project.team_id,
        kind: "task" as const,
        scope: "team" as const,
        title: t.title.trim().slice(0, 200),
        details: t.details?.trim() || null,
        priority: t.priority,
        project_id: project.id,
        milestone_id: milestoneId,
        start_date: t.due_date,
        end_date: t.due_date,
        position: startPosition + i,
      }));
    if (!rows.length) return;
    const { error } = await db.from("items").insert(rows);
    if (error) throw new Error(error.message);
    tasks += rows.length;
  };

  let position = startPosition;
  for (const m of plan.milestones ?? []) {
    if (!m.keep || !m.title.trim()) continue;
    const { data, error } = await db
      .from("milestones")
      .insert({
        project_id: project.id,
        title: m.title.trim().slice(0, 200),
        description: m.description?.trim() || null,
        due_date: m.due_date,
        position: position++,
      })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message ?? "Could not add a milestone");
    milestones++;
    await insertTasks(m.tasks, data.id);
  }
  if (plan.tasks) await insertTasks(plan.tasks, plan.milestoneId ?? null);
  return { milestones, tasks };
}
