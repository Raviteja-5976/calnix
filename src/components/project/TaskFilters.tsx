"use client";

import { useMemo, useState } from "react";
import { PRIORITIES, PRIORITY_LABEL, type Item, type Milestone, type Priority } from "@/lib/types";
import { useWorkspace } from "../WorkspaceShell";

export function useTaskFilters() {
  const [milestone, setMilestone] = useState("");
  const [assignee, setAssignee] = useState("");
  const [label, setLabel] = useState("");
  const [priority, setPriority] = useState<Priority | "">("");
  const [text, setText] = useState("");
  return useMemo(
    () => ({
      milestone,
      setMilestone,
      assignee,
      setAssignee,
      label,
      setLabel,
      priority,
      setPriority,
      text,
      setText,
      apply: (tasks: Item[]) =>
        tasks.filter(
          (t) =>
            (!milestone || (milestone === "none" ? !t.milestone_id : t.milestone_id === milestone)) &&
            (!assignee || (assignee === "none" ? !t.assignee_id : t.assignee_id === assignee)) &&
            (!label || t.labels.includes(label)) &&
            (!priority || t.priority === priority) &&
            (!text || t.title.toLowerCase().includes(text.toLowerCase())),
        ),
    }),
    [milestone, assignee, label, priority, text],
  );
}

export type Filters = ReturnType<typeof useTaskFilters>;

export function TaskFilters({ filters, milestones, tasks }: { filters: Filters; milestones: Milestone[]; tasks: Item[] }) {
  const { members } = useWorkspace();
  const labels = useMemo(() => [...new Set(tasks.flatMap((t) => t.labels))].sort(), [tasks]);
  const people = members.filter((m) => tasks.some((t) => t.assignee_id === m.id));
  return (
    <div className="filters" role="group" aria-label="Filter tasks">
      <input value={filters.text} onChange={(e) => filters.setText(e.target.value)} placeholder="Filter tasks…" aria-label="Filter by title" />
      <select value={filters.milestone} onChange={(e) => filters.setMilestone(e.target.value)} aria-label="Milestone">
        <option value="">All milestones</option>
        <option value="none">No milestone</option>
        {milestones.map((m) => (
          <option key={m.id} value={m.id}>
            {m.title}
          </option>
        ))}
      </select>
      <select value={filters.assignee} onChange={(e) => filters.setAssignee(e.target.value)} aria-label="Assignee">
        <option value="">Anyone</option>
        <option value="none">Unassigned</option>
        {people.map((m) => (
          <option key={m.id} value={m.id}>
            {m.full_name}
          </option>
        ))}
      </select>
      <select value={filters.priority} onChange={(e) => filters.setPriority(e.target.value as Priority | "")} aria-label="Priority">
        <option value="">Any priority</option>
        {PRIORITIES.map((p) => (
          <option key={p} value={p}>
            {PRIORITY_LABEL[p]}
          </option>
        ))}
      </select>
      {labels.length > 0 && (
        <select value={filters.label} onChange={(e) => filters.setLabel(e.target.value)} aria-label="Label">
          <option value="">Any label</option>
          {labels.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
