"use client";

import { CalendarClock, ListTree } from "lucide-react";
import { shortDate, today } from "@/lib/dates";
import { PRIORITY_LABEL, type Item } from "@/lib/types";
import { Avatar, useWorkspace } from "../WorkspaceShell";

/** A task as it appears on the board, the list and My tasks. */
export function TaskCard({
  task,
  subtasks = [],
  milestone,
  draggable,
  compact,
}: {
  task: Item;
  subtasks?: Item[];
  milestone?: string;
  draggable?: boolean;
  compact?: boolean;
}) {
  const { memberById, openItem } = useWorkspace();
  const assignee = memberById(task.assignee_id);
  const late = task.status !== "done" && task.start_date && task.start_date < today();
  const doneSubs = subtasks.filter((s) => s.status === "done").length;
  return (
    <button
      type="button"
      className={`task-card priority-${task.priority}${task.status === "done" ? " is-done" : ""}${compact ? " is-compact" : ""}`}
      onClick={() => openItem(task.id)}
      draggable={draggable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/task-id", task.id);
        e.dataTransfer.effectAllowed = "move";
      }}
    >
      <span className="task-card-title">{task.title}</span>
      {milestone && <span className="task-card-milestone">{milestone}</span>}
      <span className="task-card-meta">
        {task.priority !== "none" && <span className={`priority-tag priority-${task.priority}`}>{PRIORITY_LABEL[task.priority]}</span>}
        {task.start_date && (
          <span className={`inline-icon${late ? " overdue" : ""}`}>
            <CalendarClock size={12} />
            {shortDate(task.start_date)}
          </span>
        )}
        {subtasks.length > 0 && (
          <span className="inline-icon">
            <ListTree size={12} />
            {doneSubs}/{subtasks.length}
          </span>
        )}
        {task.labels.slice(0, 3).map((l) => (
          <span key={l} className="label-chip">
            {l}
          </span>
        ))}
        {assignee && <Avatar member={assignee} size={20} />}
      </span>
    </button>
  );
}
