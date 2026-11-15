"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { addDays, today } from "@/lib/dates";
import { commitPlan } from "@/lib/plan";
import { TEMPLATES } from "@/lib/project-templates";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { announceProjectsChanged } from "@/lib/use-projects";
import { PROJECT_STATUS_LABEL, type Project, type ProjectStatus } from "@/lib/types";
import { useWorkspace } from "./WorkspaceShell";

const COLORS = ["#FF6B35", "#4EA8FF", "#6EE7B7", "#FF5C7A", "#B794F6", "#FFC542", "#1B1F3B"];

/** Create or edit a project: its goal, dates, lead and colour, optionally from a template. */
export function ProjectForm({
  project,
  onClose,
  onSaved,
}: {
  project?: Project;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { writableTeams, members, me } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [teamId, setTeamId] = useState(
    project?.team_id ?? writableTeams.find((t) => me.teamIds.includes(t.id))?.id ?? writableTeams[0]?.id ?? "",
  );
  const [name, setName] = useState(project?.name ?? "");
  const [goal, setGoal] = useState(project?.goal ?? "");
  const [description, setDescription] = useState(project?.description ?? "");
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active");
  const [lead, setLead] = useState(project?.lead_id ?? me.id);
  const [start, setStart] = useState(project?.start_date ?? today());
  const [target, setTarget] = useState(project?.target_date ?? "");
  const [color, setColor] = useState(project?.color ?? COLORS[0]);
  const [template, setTemplate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const teamMembers = members.filter((m) => m.teamIds.includes(teamId));

  function chooseTemplate(id: string) {
    setTemplate(id);
    const t = TEMPLATES.find((x) => x.id === id);
    if (!t) return;
    if (!goal.trim()) setGoal(t.goal);
    if (!name.trim()) setName(t.name);
    if (!target) setTarget(addDays(start || today(), Math.max(...t.milestones.map((m) => m.day))));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return setError("Give the project a name.");
    if (start && target && target < start) return setError("The target date is before the start date.");
    setBusy(true);
    setError(null);
    const db = supabaseBrowser();
    const fields = {
      name: name.trim(),
      goal: goal.trim() || null,
      description: description.trim() || null,
      status,
      lead_id: teamMembers.some((m) => m.id === lead) ? lead : null,
      start_date: start || null,
      target_date: target || null,
      color,
    };

    if (project) {
      const { error: failure } = await db.from("projects").update(fields).eq("id", project.id);
      setBusy(false);
      if (failure) return setError(failure.message);
      announceProjectsChanged();
      return onSaved(project.id);
    }

    const { data, error: failure } = await db
      .from("projects")
      .insert({ ...fields, team_id: teamId })
      .select("*")
      .single();
    if (failure || !data) {
      setBusy(false);
      return setError(failure?.message ?? "Could not create the project.");
    }
    const t = TEMPLATES.find((x) => x.id === template);
    if (t) {
      const base = start || today();
      try {
        await commitPlan(data as Project, {
          milestones: t.milestones.map((m) => ({
            title: m.title,
            due_date: addDays(base, m.day),
            keep: true,
            tasks: m.tasks.map((task) => ({
              title: task.title,
              priority: task.priority ?? "none",
              due_date: null,
              keep: true,
            })),
          })),
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "The template could not be added.");
      }
    }
    setBusy(false);
    announceProjectsChanged();
    onSaved(data.id);
  }

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="project-form-title">
      <form className="stack" onSubmit={submit}>
        <header className="modal-head">
          <h2 id="project-form-title">{project ? "Edit project" : "New project"}</h2>
          <button type="button" className="btn-plain" onClick={() => dialog.current?.close()} aria-label="Close dialog">
            <X size={16} />
            <span>Close</span>
          </button>
        </header>

        {!project && (
          <label className="field">
            Start from
            <select value={template} onChange={(e) => chooseTemplate(e.target.value)}>
              <option value="">A blank project</option>
              {TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  Template: {t.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required autoFocus placeholder="e.g. Spring course launch" />
        </label>
        <label className="field">
          Goal
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="What does done look like? e.g. 200 students enrolled by March 1"
          />
        </label>
        <label className="field">
          Description (optional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} maxLength={10000} />
        </label>

        <div className="field-row">
          {!project && writableTeams.length > 1 && (
            <label className="field">
              Team
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
                {writableTeams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Lead
            <select value={lead ?? ""} onChange={(e) => setLead(e.target.value)}>
              <option value="">No lead</option>
              {teamMembers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            Status
            <select value={status} onChange={(e) => setStatus(e.target.value as ProjectStatus)}>
              {Object.entries(PROJECT_STATUS_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="field-row">
          <label className="field">
            Start date
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
          </label>
          <label className="field">
            Target date
            <input type="date" value={target} min={start || undefined} onChange={(e) => setTarget(e.target.value)} />
          </label>
        </div>

        <fieldset className="field">
          <legend>Colour</legend>
          <div className="swatch-row">
            {COLORS.map((c) => (
              <label key={c} className="swatch-pick" style={{ background: c }}>
                <input type="radio" name="color" checked={color === c} onChange={() => setColor(c)} aria-label={c} />
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-foot">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={busy || !teamId}>
            {busy ? "Saving…" : project ? "Save project" : "Create project"}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
