"use client";

import { PRIORITIES, PRIORITY_LABEL, type Priority } from "@/lib/types";
import type { DraftMilestone, DraftTask } from "@/lib/plan";

function TaskRows({ tasks, onChange }: { tasks: DraftTask[]; onChange: (tasks: DraftTask[]) => void }) {
  const set = (i: number, patch: Partial<DraftTask>) => onChange(tasks.map((t, j) => (j === i ? { ...t, ...patch } : t)));
  return (
    <ul className="draft-list">
      {tasks.map((t, i) => (
        <li key={i} className={t.keep ? "" : "is-dropped"}>
          <input type="checkbox" checked={t.keep} onChange={() => set(i, { keep: !t.keep })} aria-label="Keep this task" />
          <input className="inline-input" value={t.title} onChange={(e) => set(i, { title: e.target.value })} aria-label="Task title" />
          <select
            value={t.priority}
            onChange={(e) => set(i, { priority: e.target.value as Priority })}
            aria-label="Priority"
            className="inline-select"
          >
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {PRIORITY_LABEL[p]}
              </option>
            ))}
          </select>
          <input
            type="date"
            className="inline-date"
            value={t.due_date ?? ""}
            onChange={(e) => set(i, { due_date: e.target.value || null })}
            aria-label="Due date"
          />
        </li>
      ))}
    </ul>
  );
}

/** Review an AI or template plan: edit titles and dates, untick what to skip. */
export function PlanDraft({
  milestones,
  tasks,
  onChange,
}: {
  milestones?: DraftMilestone[];
  tasks?: DraftTask[];
  onChange: (next: { milestones?: DraftMilestone[]; tasks?: DraftTask[] }) => void;
}) {
  if (tasks) return <TaskRows tasks={tasks} onChange={(t) => onChange({ tasks: t })} />;
  const list = milestones ?? [];
  const set = (i: number, patch: Partial<DraftMilestone>) =>
    onChange({ milestones: list.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  return (
    <ol className="plan-draft">
      {list.map((m, i) => (
        <li key={i} className={m.keep ? "" : "is-dropped"}>
          <div className="plan-draft-head">
            <input type="checkbox" checked={m.keep} onChange={() => set(i, { keep: !m.keep })} aria-label="Keep this milestone" />
            <span className="diamond" aria-hidden="true" />
            <input
              className="inline-input plan-draft-title"
              value={m.title}
              onChange={(e) => set(i, { title: e.target.value })}
              aria-label="Milestone title"
            />
            <input
              type="date"
              className="inline-date"
              value={m.due_date ?? ""}
              onChange={(e) => set(i, { due_date: e.target.value || null })}
              aria-label="Milestone due date"
            />
          </div>
          {m.keep && <TaskRows tasks={m.tasks} onChange={(t) => set(i, { tasks: t })} />}
        </li>
      ))}
    </ol>
  );
}

export const keptCount = (milestones?: DraftMilestone[], tasks?: DraftTask[]) => {
  const ms = (milestones ?? []).filter((m) => m.keep);
  return {
    milestones: ms.length,
    tasks: ms.reduce((n, m) => n + m.tasks.filter((t) => t.keep).length, 0) + (tasks ?? []).filter((t) => t.keep).length,
  };
};
