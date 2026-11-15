"use client";

import { addDays, daysBetween, shortDate, startOfWeek, today } from "@/lib/dates";
import type { Item } from "@/lib/types";
import { useWorkspace } from "../WorkspaceShell";
import { useProjectData } from "./ProjectShell";

/** Weeks across the top, milestones as diamonds, dated tasks as bars. */
export function ProjectTimeline() {
  const { project, milestones, tasks } = useProjectData();
  const { openItem } = useWorkspace();
  const now = today();

  const dated = tasks.filter((t) => !t.parent_id && t.start_date);
  const points = [
    project.start_date,
    project.target_date,
    now,
    ...milestones.map((m) => m.due_date),
    ...dated.flatMap((t) => [t.start_date, t.end_date]),
  ].filter((d): d is string => Boolean(d));

  if (dated.length === 0 && milestones.every((m) => !m.due_date)) {
    return (
      <div className="empty-state">
        <p className="muted">Give milestones or tasks a date and they will appear here.</p>
      </div>
    );
  }

  const first = startOfWeek(points.reduce((a, b) => (a < b ? a : b)));
  const lastPoint = points.reduce((a, b) => (a > b ? a : b));
  const span = Math.max(14, daysBetween(first, lastPoint) + 7);
  const weeks = Array.from({ length: Math.ceil(span / 7) }, (_, i) => addDays(first, i * 7));
  const total = weeks.length * 7;
  const at = (iso: string) => `${(daysBetween(first, iso) / total) * 100}%`;
  const width = (from: string, to: string) => `${(Math.max(1, daysBetween(from, to) + 1) / total) * 100}%`;

  const rows: { label: string; due: string | null; done: boolean; tasks: Item[] }[] = [
    ...milestones.map((m) => ({
      label: m.title,
      due: m.due_date,
      done: m.status === "done",
      tasks: dated.filter((t) => t.milestone_id === m.id),
    })),
    { label: "No milestone", due: null, done: false, tasks: dated.filter((t) => !t.milestone_id) },
  ].filter((r) => r.due || r.tasks.length);

  return (
    <div className="timeline card" style={{ "--weeks": weeks.length } as React.CSSProperties}>
      <div className="timeline-scale">
        <span className="timeline-label" />
        <div className="timeline-track">
          {weeks.map((w) => (
            <span key={w} className="timeline-week">
              {shortDate(w)}
            </span>
          ))}
        </div>
      </div>
      {rows.map((row) => (
        <div key={row.label} className="timeline-group">
          <div className="timeline-row timeline-milestone">
            <span className="timeline-label">
              <strong>{row.label}</strong>
            </span>
            <div className="timeline-track">
              <span className="timeline-today" style={{ left: at(now) }} aria-label="Today" />
              {row.due && (
                <span
                  className={`timeline-diamond${row.done ? " is-done" : ""}`}
                  style={{ left: at(row.due) }}
                  title={`${row.label}: ${shortDate(row.due)}`}
                />
              )}
            </div>
          </div>
          {row.tasks.map((t) => (
            <div key={t.id} className="timeline-row">
              <span className="timeline-label small">{t.title}</span>
              <div className="timeline-track">
                <span className="timeline-today" style={{ left: at(now) }} />
                <button
                  className={`timeline-bar status-${t.status}`}
                  style={{ left: at(t.start_date!), width: width(t.start_date!, t.end_date ?? t.start_date!) }}
                  onClick={() => openItem(t.id)}
                  title={`${t.title}: ${shortDate(t.start_date!)}`}
                >
                  <span className="sr-only">{t.title}</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
