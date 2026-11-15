"use client";

import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { runAi } from "@/lib/ai/client";
import { shortDate, today } from "@/lib/dates";
import { commitPlan, type DraftTask } from "@/lib/plan";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { announceItemsChanged } from "@/lib/use-items";
import { progressOf } from "@/lib/use-projects";
import { PRIORITY_LABEL, STATUS_LABEL, type Item, type Milestone } from "@/lib/types";
import { AiButton } from "../AiButton";
import { keptCount, PlanDraft } from "../PlanDraft";
import { Avatar, useWorkspace } from "../WorkspaceShell";
import { TaskFilters, useTaskFilters } from "./TaskFilters";
import { useProjectData } from "./ProjectShell";

/** Tasks grouped by milestone, with sorting and AI break-down per milestone. */
export function ProjectList() {
  const { project, milestones, tasks, reload, canEdit } = useProjectData();
  const { newItem, openItem, memberById, org, aiEnabled } = useWorkspace();
  const filters = useTaskFilters();
  const [sort, setSort] = useState<"position" | "due" | "priority">("position");
  const [drafts, setDrafts] = useState<{ milestoneId: string; tasks: DraftTask[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const now = today();

  const rank = { urgent: 0, high: 1, medium: 2, low: 3, none: 4 };
  const top = useMemo(() => {
    const list = filters.apply(tasks.filter((t) => !t.parent_id));
    return [...list].sort((a, b) =>
      sort === "due"
        ? (a.start_date ?? "9999").localeCompare(b.start_date ?? "9999")
        : sort === "priority"
          ? rank[a.priority] - rank[b.priority]
          : a.position - b.position,
    );
    // rank is a constant.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks, filters, sort]);

  const groups: { milestone: Milestone | null; tasks: Item[] }[] = [
    ...milestones.map((m) => ({ milestone: m, tasks: top.filter((t) => t.milestone_id === m.id) })),
    { milestone: null, tasks: top.filter((t) => !t.milestone_id) },
  ];

  async function toggle(task: Item) {
    const { error: failure } = await supabaseBrowser()
      .from("items")
      .update({ status: task.status === "done" ? "todo" : "done" })
      .eq("id", task.id);
    if (failure) setError(failure.message);
    announceItemsChanged();
    reload();
  }

  async function breakDown(m: Milestone) {
    setBusy(m.id);
    setError(null);
    try {
      const result = await runAi("breakdown", org.id, {
        projectId: project.id,
        target: "milestone",
        title: m.title,
        details: m.description,
      });
      setDrafts({ milestoneId: m.id, tasks: result.tasks.map((t) => ({ ...t, keep: true })) });
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI request failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="stack">
      <div className="filters-row">
        <TaskFilters filters={filters} milestones={milestones} tasks={tasks} />
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Sort">
          <option value="position">Sort: manual</option>
          <option value="due">Sort: due date</option>
          <option value="priority">Sort: priority</option>
        </select>
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {groups.map(({ milestone, tasks: list }) => {
        if (!milestone && !list.length) return null;
        const p = progressOf(tasks.filter((t) => (milestone ? t.milestone_id === milestone.id : !t.milestone_id)));
        return (
          <section key={milestone?.id ?? "none"} className="card list-group">
            <header className="list-group-head">
              <span className="diamond" aria-hidden="true" />
              <h2>{milestone?.title ?? "No milestone"}</h2>
              {milestone?.due_date && (
                <span className={`small${milestone.status !== "done" && milestone.due_date < now ? " overdue" : ""}`}>
                  Due {shortDate(milestone.due_date)}
                </span>
              )}
              <span className="small muted">
                {p.done}/{p.total} done
              </span>
              <span className="spacer" />
              {milestone && canEdit && aiEnabled && (
                <AiButton busy={busy === milestone.id} onClick={() => breakDown(milestone)}>
                  Break down
                </AiButton>
              )}
              {canEdit && (
                <button
                  className="btn btn-small"
                  onClick={() =>
                    newItem({ kind: "task", project_id: project.id, team_id: project.team_id, milestone_id: milestone?.id })
                  }
                >
                  <Plus size={13} />
                  <span>Task</span>
                </button>
              )}
            </header>

            {drafts && milestone && drafts.milestoneId === milestone.id && (
              <div className="ai-draft">
                <PlanDraft tasks={drafts.tasks} onChange={(n) => setDrafts({ ...drafts, tasks: n.tasks ?? [] })} />
                <div className="row-gap">
                  <button
                    className="btn btn-primary btn-small"
                    onClick={async () => {
                      try {
                        await commitPlan(project, { tasks: drafts.tasks, milestoneId: milestone.id }, tasks.length);
                        setDrafts(null);
                        reload();
                      } catch (err) {
                        setError(err instanceof Error ? err.message : "Could not add the tasks.");
                      }
                    }}
                  >
                    Add {keptCount(undefined, drafts.tasks).tasks} tasks
                  </button>
                  <button className="btn btn-small" onClick={() => setDrafts(null)}>
                    Discard
                  </button>
                </div>
              </div>
            )}

            {list.length === 0 ? (
              <p className="muted small">No tasks match.</p>
            ) : (
              <table className="task-table">
                <thead>
                  <tr>
                    <th className="sr-only">Done</th>
                    <th>Task</th>
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Assignee</th>
                    <th>Due</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((t) => {
                    const subs = tasks.filter((s) => s.parent_id === t.id);
                    const who = memberById(t.assignee_id);
                    return (
                      <tr key={t.id} className={t.status === "done" ? "is-done" : ""}>
                        <td>
                          <input
                            type="checkbox"
                            checked={t.status === "done"}
                            onChange={() => toggle(t)}
                            disabled={!canEdit}
                            aria-label={`Mark ${t.title} done`}
                          />
                        </td>
                        <td>
                          <button className="link-button" onClick={() => openItem(t.id)}>
                            {t.title}
                          </button>
                          {subs.length > 0 && (
                            <span className="muted small">
                              {" "}
                              · {subs.filter((s) => s.status === "done").length}/{subs.length} subtasks
                            </span>
                          )}
                          {t.labels.map((l) => (
                            <span key={l} className="label-chip">
                              {l}
                            </span>
                          ))}
                        </td>
                        <td>
                          <span className={`status-pill status-${t.status}`}>{STATUS_LABEL[t.status]}</span>
                        </td>
                        <td>{t.priority !== "none" && <span className={`priority-tag priority-${t.priority}`}>{PRIORITY_LABEL[t.priority]}</span>}</td>
                        <td>{who ? <Avatar member={who} size={22} /> : <span className="muted small">—</span>}</td>
                        <td className={t.status !== "done" && t.start_date && t.start_date < now ? "overdue" : ""}>
                          {t.start_date ? shortDate(t.start_date) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        );
      })}
      {tasks.length === 0 && (
        <div className="empty-state">
          <p className="muted">No tasks yet. Add one, or ask AI to plan the project from the Overview tab.</p>
        </div>
      )}
    </div>
  );
}
