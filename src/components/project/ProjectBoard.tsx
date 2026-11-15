"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { announceItemsChanged } from "@/lib/use-items";
import { STATUSES, STATUS_LABEL, type Item, type TaskStatus } from "@/lib/types";
import { useWorkspace } from "../WorkspaceShell";
import { TaskFilters, useTaskFilters } from "./TaskFilters";
import { TaskCard } from "./TaskCard";
import { useProjectData } from "./ProjectShell";

/** Kanban by status. Drag a card to another column to change its status. */
export function ProjectBoard() {
  const { project, milestones, tasks, reload, canEdit } = useProjectData();
  const { newItem } = useWorkspace();
  const filters = useTaskFilters();
  const [over, setOver] = useState<TaskStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  const top = useMemo(() => filters.apply(tasks.filter((t) => !t.parent_id)), [tasks, filters]);
  const subsOf = (id: string) => tasks.filter((t) => t.parent_id === id);
  const milestoneName = (id: string | null) => milestones.find((m) => m.id === id)?.title;

  async function move(id: string, status: TaskStatus) {
    const task = tasks.find((t) => t.id === id);
    if (!task || task.status === status) return;
    setError(null);
    if (status === "done") {
      const { data: deps } = await supabaseBrowser().from("task_dependencies").select("depends_on_id").eq("task_id", id);
      const waiting = ((deps ?? []) as { depends_on_id: string }[])
        .map((d) => tasks.find((t) => t.id === d.depends_on_id))
        .filter((t): t is Item => Boolean(t && t.status !== "done"));
      if (waiting.length) {
        setError(`“${task.title}” is blocked by “${waiting[0].title}”. Finish that first.`);
        return;
      }
    }
    const { error: failure } = await supabaseBrowser()
      .from("items")
      .update({ status, position: Math.max(0, ...tasks.map((t) => t.position)) + 1 })
      .eq("id", id);
    if (failure) setError(failure.message);
    announceItemsChanged();
    reload();
  }

  return (
    <div className="stack">
      <TaskFilters filters={filters} milestones={milestones} tasks={tasks} />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <div className="kanban">
        {STATUSES.map((status) => {
          const column = top.filter((t) => t.status === status).sort((a, b) => a.position - b.position);
          return (
            <section
              key={status}
              className={`kanban-col status-col-${status}${over === status ? " is-over" : ""}`}
              onDragOver={(e) => {
                if (!canEdit) return;
                e.preventDefault();
                setOver(status);
              }}
              onDragLeave={() => setOver(null)}
              onDrop={(e) => {
                e.preventDefault();
                setOver(null);
                const id = e.dataTransfer.getData("text/task-id");
                if (id) move(id, status);
              }}
              aria-label={STATUS_LABEL[status]}
            >
              <header>
                <h3>{STATUS_LABEL[status]}</h3>
                <span className="count">{column.length}</span>
              </header>
              <div className="kanban-cards">
                {column.map((t) => (
                  <TaskCard key={t.id} task={t} subtasks={subsOf(t.id)} milestone={milestoneName(t.milestone_id)} draggable={canEdit} />
                ))}
              </div>
              {canEdit && (
                <button
                  className="btn btn-plain kanban-add"
                  onClick={() => newItem({ kind: "task", project_id: project.id, team_id: project.team_id, status })}
                >
                  <Plus size={14} />
                  <span>Add task</span>
                </button>
              )}
            </section>
          );
        })}
      </div>
      <p className="hint">Drag cards between columns to change their status, or open a card to change it there.</p>
    </div>
  );
}
