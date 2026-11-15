"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToTable, supabaseBrowser } from "./supabase/browser";
import type { Item, Milestone, Project } from "./types";

/** The organization's projects, kept current over Realtime. */
export function useProjects(orgId: string, { archived = false } = {}) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    let query = supabaseBrowser().from("projects").select("*").eq("org_id", orgId);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data } = await query.order("updated_at", { ascending: false });
    if (mine !== ticket.current) return;
    setProjects((data ?? []) as Project[]);
    setLoading(false);
  }, [orgId, archived]);

  useEffect(() => {
    queueMicrotask(load);
    const off = subscribeToTable(`projects-${orgId}-${archived}`, { event: "*", table: "projects" }, () => load());
    window.addEventListener("dta:projects", load);
    return () => {
      window.removeEventListener("dta:projects", load);
      off();
    };
  }, [load, orgId, archived]);

  return { projects, loading, reload: load };
}

export const announceProjectsChanged = () => window.dispatchEvent(new Event("dta:projects"));

/** One project with its milestones and tasks (subtasks included). */
export function useProject(projectId: string) {
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [tasks, setTasks] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const ticket = useRef(0);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    const db = supabaseBrowser();
    const [p, m, t] = await Promise.all([
      db.from("projects").select("*").eq("id", projectId).maybeSingle(),
      db.from("milestones").select("*").eq("project_id", projectId).order("position").order("due_date"),
      db.from("items").select("*").eq("project_id", projectId).order("position").order("created_at"),
    ]);
    if (mine !== ticket.current) return;
    setProject(p.data as Project | null);
    setMissing(!p.data);
    setMilestones((m.data ?? []) as Milestone[]);
    setTasks((t.data ?? []) as Item[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(load);
    const offs = [
      subscribeToTable(`project-${projectId}`, { event: "*", table: "projects", filter: `id=eq.${projectId}` }, () => load()),
      subscribeToTable(`milestones-${projectId}`, { event: "*", table: "milestones", filter: `project_id=eq.${projectId}` }, () => load()),
      subscribeToTable(`tasks-${projectId}`, { event: "*", table: "items", filter: `project_id=eq.${projectId}` }, () => load()),
    ];
    window.addEventListener("calnix:items", load);
    window.addEventListener("dta:projects", load);
    return () => {
      window.removeEventListener("calnix:items", load);
      window.removeEventListener("dta:projects", load);
      offs.forEach((off) => off());
    };
  }, [load, projectId]);

  return { project, milestones, tasks, loading, missing, reload: load };
}

/** Progress of a set of tasks: top-level tasks only, so subtasks don't skew it. */
export function progressOf(tasks: Item[]) {
  const top = tasks.filter((t) => !t.parent_id);
  const done = top.filter((t) => t.status === "done").length;
  return { done, total: top.length, percent: top.length ? Math.round((done / top.length) * 100) : 0 };
}
