"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { addDays, today } from "@/lib/dates";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import type { Item } from "@/lib/types";
import { TaskCard } from "./project/TaskCard";
import { useWorkspace } from "./WorkspaceShell";

/** Everything assigned to me, across projects, grouped by when it is due. */
export function MyTasks() {
  const { org, userId, projects, newItem } = useWorkspace();
  const [tasks, setTasks] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const [projectFilter, setProjectFilter] = useState("");

  const load = useCallback(async () => {
    let query = supabaseBrowser()
      .from("items")
      .select("*")
      .eq("org_id", org.id)
      .eq("kind", "task")
      .or(`assignee_id.eq.${userId},and(owner_id.eq.${userId},scope.eq.personal)`);
    if (!showDone) query = query.neq("status", "done");
    const { data } = await query.order("start_date", { ascending: true, nullsFirst: false }).limit(500);
    setTasks((data ?? []) as Item[]);
    setLoading(false);
  }, [org.id, userId, showDone]);

  useEffect(() => {
    queueMicrotask(load);
    const off = subscribeToTable(`my-tasks-${userId}`, { event: "*", table: "items" }, () => load());
    window.addEventListener("calnix:items", load);
    return () => {
      window.removeEventListener("calnix:items", load);
      off();
    };
  }, [load, userId]);

  const now = today();
  const weekEnd = addDays(now, 7);
  const projectName = useMemo(() => new Map(projects.map((p) => [p.id, p.name])), [projects]);
  const visible = tasks.filter((t) => !projectFilter || (projectFilter === "none" ? !t.project_id : t.project_id === projectFilter));

  const open = visible.filter((t) => t.status !== "done");
  const groups = [
    { key: "overdue", label: "Overdue", tasks: open.filter((t) => t.start_date && t.start_date < now) },
    { key: "today", label: "Today", tasks: open.filter((t) => t.start_date === now) },
    { key: "week", label: "Next 7 days", tasks: open.filter((t) => t.start_date && t.start_date > now && t.start_date <= weekEnd) },
    { key: "later", label: "Later", tasks: open.filter((t) => t.start_date && t.start_date > weekEnd) },
    { key: "undated", label: "No due date", tasks: open.filter((t) => !t.start_date) },
    { key: "done", label: "Done", tasks: visible.filter((t) => t.status === "done") },
  ];

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <p className="eyebrow">Assigned to you</p>
          <h1>My tasks</h1>
        </div>
        <div className="page-actions">
          <select value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} aria-label="Project">
            <option value="">All projects</option>
            <option value="none">Not in a project</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <button className="btn" aria-pressed={showDone} onClick={() => setShowDone(!showDone)}>
            {showDone ? "Hiding nothing" : "Show done"}
          </button>
          <button className="btn btn-primary" onClick={() => newItem({ kind: "task", start_date: now })}>
            <Plus size={15} />
            <span>New task</span>
          </button>
        </div>
      </header>

      {loading ? (
        <p className="muted">Loading your tasks…</p>
      ) : visible.length === 0 ? (
        <div className="empty-state">
          <h2>Nothing on your plate</h2>
          <p className="muted">Tasks assigned to you, and your personal tasks, show up here.</p>
        </div>
      ) : (
        <div className="my-task-groups">
          {groups
            .filter((g) => g.tasks.length)
            .map((g) => (
              <section key={g.key} className={`card my-task-group group-${g.key}`}>
                <h2>
                  {g.label} <span className="count">{g.tasks.length}</span>
                </h2>
                <div className="my-task-list">
                  {g.tasks.map((t) => (
                    <TaskCard key={t.id} task={t} milestone={t.project_id ? projectName.get(t.project_id) : undefined} compact />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}
