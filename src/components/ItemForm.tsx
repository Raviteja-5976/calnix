"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { CheckSquare, Calendar, Wrench, Terminal, X } from "lucide-react";
import { runAi } from "@/lib/ai/client";
import { itemInput, type ItemInput } from "@/lib/item-input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { announceItemsChanged } from "@/lib/use-items";
import { weekdayShort, today } from "@/lib/dates";
import {
  KIND_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  type Item,
  type ItemKind,
  type ItemScope,
  type Milestone,
  type Priority,
  type TaskStatus,
} from "@/lib/types";
import { AiButton } from "./AiButton";
import { ImagePicker, uploadItemImage } from "./ImagePicker";
import { useWorkspace } from "./WorkspaceShell";

export interface ItemDefaults {
  kind?: ItemKind;
  start_date?: string;
  team_id?: string;
  project_id?: string;
  milestone_id?: string;
  parent_id?: string;
  status?: TaskStatus;
  title?: string;
  details?: string;
  priority?: Priority;
}

const KINDS: ItemKind[] = ["task", "event", "tool", "prompt"];

const KIND_ICONS: Record<ItemKind, React.ElementType> = {
  task: CheckSquare,
  event: Calendar,
  tool: Wrench,
  prompt: Terminal,
};

export function ItemForm({
  item,
  defaults,
  onClose,
  onSaved,
}: {
  item?: Item;
  defaults?: ItemDefaults;
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const { writableTeams, members, teams, me, projects, org, aiEnabled } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const editing = Boolean(item);

  const [kind, setKind] = useState<ItemKind>(item?.kind ?? defaults?.kind ?? "task");
  const [scope, setScope] = useState<ItemScope>(item?.scope ?? "team");
  const [projectId, setProjectId] = useState(item?.project_id ?? defaults?.project_id ?? "");
  const project = projects.find((p) => p.id === projectId);
  const [teamId, setTeamId] = useState(
    item?.team_id ??
      project?.team_id ??
      defaults?.team_id ??
      writableTeams.find((t) => me.teamIds.includes(t.id))?.id ??
      writableTeams[0]?.id ??
      "",
  );
  const [milestoneId, setMilestoneId] = useState(item?.milestone_id ?? defaults?.milestone_id ?? "");
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [status, setStatus] = useState<TaskStatus>(item?.status ?? defaults?.status ?? "todo");
  const [priority, setPriority] = useState<Priority>(item?.priority ?? defaults?.priority ?? "none");
  const [labels, setLabels] = useState((item?.labels ?? []).join(", "));

  const [title, setTitle] = useState(item?.title ?? defaults?.title ?? "");
  const [details, setDetails] = useState(item?.details ?? defaults?.details ?? "");
  const [summary, setSummary] = useState(item?.summary ?? "");
  const [url, setUrl] = useState(item?.url ?? "");
  const [promptBody, setPromptBody] = useState(item?.prompt_body ?? "");
  const [start, setStart] = useState(item?.start_date ?? defaults?.start_date ?? "");
  const [end, setEnd] = useState(item?.end_date !== item?.start_date ? (item?.end_date ?? "") : "");
  const [startTime, setStartTime] = useState(item?.start_time?.slice(0, 5) ?? "");
  const [endTime, setEndTime] = useState(item?.end_time?.slice(0, 5) ?? "");
  const [onCalendar, setOnCalendar] = useState(Boolean(item?.start_date ?? defaults?.start_date));
  const [assignee, setAssignee] = useState(item?.assignee_id ?? "");

  const [cover, setCover] = useState<Blob | null>(null);
  const [aiCover, setAiCover] = useState(false);
  const [quickText, setQuickText] = useState("");
  const [aiBusy, setAiBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // Milestones of the chosen project, for the milestone picker.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("milestones")
        .select("*")
        .eq("project_id", projectId)
        .order("position");
      if (!cancelled) setMilestones((data ?? []) as Milestone[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const isTask = kind === "task";
  const inProject = isTask && Boolean(projectId);
  const dateRequired = kind === "event" || (isTask && !projectId);
  const showDates = dateRequired || onCalendar;
  const teamMembers = members.filter((m) => m.teamIds.includes(teamId));
  const teamProjects = useMemo(
    () => projects.filter((p) => writableTeams.some((t) => t.id === p.team_id)),
    [projects, writableTeams],
  );

  async function ai<T>(name: string, run: () => Promise<T>, apply: (result: T) => void) {
    setAiBusy(name);
    setError(null);
    try {
      apply(await run());
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI request failed.");
    } finally {
      setAiBusy(null);
    }
  }

  const quickAdd = () =>
    ai(
      "quick",
      () => runAi("quick-add", org.id, { text: quickText, weekday: weekdayShort(today()) }),
      (r) => {
        setKind(r.kind);
        setTitle(r.title);
        if (r.details && !details) setDetails(r.details);
        if (r.start_date) {
          setStart(r.start_date);
          setOnCalendar(true);
        }
        if (r.end_date && r.end_date !== r.start_date) setEnd(r.end_date);
        if (r.start_time) setStartTime(r.start_time);
        if (r.end_time) setEndTime(r.end_time);
        setQuickText("");
      },
    );

  const describe = () =>
    ai(
      "describe",
      () => runAi("describe", org.id, { kind, title, details, url, prompt_body: promptBody }),
      (r) => setSummary(r.summary),
    );

  const improvePrompt = () =>
    ai(
      "improve",
      () => runAi("improve-prompt", org.id, { prompt: promptBody }),
      (r) => setPromptBody(r.prompt),
    );

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = itemInput.safeParse({
      team_id: teamId,
      kind,
      scope,
      title,
      details,
      summary,
      url: kind === "tool" ? url : "",
      prompt_body: kind === "prompt" ? promptBody : "",
      start_date: showDates ? start : "",
      end_date: showDates ? end : "",
      start_time: showDates && kind === "event" ? startTime : "",
      end_time: showDates && kind === "event" ? endTime : "",
      assignee_id: scope === "team" && isTask ? assignee : "",
      project_id: isTask ? projectId : "",
      milestone_id: inProject ? milestoneId : "",
      parent_id: item?.parent_id ?? defaults?.parent_id ?? "",
      status: isTask ? status : "todo",
      priority: isTask ? priority : "none",
      labels: labels
        .split(",")
        .map((l) => l.trim())
        .filter(Boolean),
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form values");
      return;
    }

    setBusy(true);
    setError(null);
    let savedId = item?.id;

    if (item) {
      // team_id and kind stay fixed once an item exists.
      const changes: Partial<ItemInput> = { ...parsed.data };
      delete changes.team_id;
      delete changes.kind;
      const { data, error: failure } = await supabaseBrowser()
        .from("items")
        .update(changes)
        .eq("id", item.id)
        .select("id");
      if (failure || !data?.length) {
        setBusy(false);
        setError(failure?.message ?? "You can only edit items you have permission for.");
        return;
      }
    } else {
      const response = await fetch("/api/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed.data),
      });
      const result = await response.json().catch(() => ({}));
      savedId = result.item?.id;
      if (!response.ok || !savedId) {
        setBusy(false);
        setError(result.error ?? "Could not save. Try again.");
        return;
      }
    }

    // The person's own image always wins; AI only runs if they ticked the box.
    try {
      if (cover) await uploadItemImage(savedId!, cover);
      else if (aiCover) await fetch(`/api/items/${savedId}/cover`, { method: "POST" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Saved, but the image could not be uploaded.");
    }
    setBusy(false);
    announceItemsChanged();
    onSaved(savedId!);
  }

  return (
    <dialog ref={dialog} className="modal modal-wide" onClose={onClose} aria-labelledby="item-form-title">
      <form onSubmit={submit} className="stack">
        <header className="modal-head">
          <h2 id="item-form-title">{editing ? `Edit ${KIND_LABEL[kind]}` : "Add to DTA-Cal"}</h2>
          <button type="button" className="btn-plain" onClick={() => dialog.current?.close()} aria-label="Close dialog">
            <X size={16} />
            <span>Close</span>
          </button>
        </header>

        {!writableTeams.length && <p className="error">You need to join a team before adding items.</p>}

        {!editing && aiEnabled && (
          <div className="quick-add">
            <input
              value={quickText}
              onChange={(e) => setQuickText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (quickText.trim().length >= 2) quickAdd();
                }
              }}
              placeholder="Quick add: “Design review with Maya next Tue 3–4pm”"
              aria-label="Describe the entry in plain English"
            />
            <AiButton busy={aiBusy === "quick"} disabled={quickText.trim().length < 2} onClick={quickAdd}>
              Fill form
            </AiButton>
          </div>
        )}

        {!editing && (
          <fieldset className="segmented">
            <legend className="sr-only">Type</legend>
            {KINDS.map((k) => {
              const Icon = KIND_ICONS[k];
              return (
                <label key={k} className={`seg seg-${k}`}>
                  <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
                  <span>
                    <Icon size={14} />
                    {KIND_LABEL[k]}
                  </span>
                </label>
              );
            })}
          </fieldset>
        )}

        <label className="field">
          Title
          <input
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={
              kind === "task"
                ? "e.g. Design review for dashboard"
                : kind === "event"
                  ? "e.g. Weekly team sync"
                  : kind === "tool"
                    ? "e.g. Supabase Admin Console"
                    : "e.g. System prompt for code generation"
            }
            autoFocus
          />
        </label>

        {kind === "tool" && (
          <label className="field">
            Link
            <input type="url" required placeholder="https://..." value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
        )}

        {kind === "prompt" && (
          <div className="field">
            <div className="field-label-row">
              <label htmlFor="prompt-body">Prompt text</label>
              {aiEnabled && (
                <AiButton busy={aiBusy === "improve"} disabled={promptBody.trim().length < 5} onClick={improvePrompt}>
                  Improve prompt
                </AiButton>
              )}
            </div>
            <textarea
              id="prompt-body"
              required
              rows={6}
              maxLength={50000}
              placeholder="Enter your reusable AI prompt here..."
              value={promptBody}
              onChange={(e) => setPromptBody(e.target.value)}
            />
          </div>
        )}

        <div className="field">
          <div className="field-label-row">
            <label htmlFor="item-summary">Description</label>
            {aiEnabled && !summary.trim() && (
              <AiButton
                busy={aiBusy === "describe"}
                disabled={!title.trim()}
                onClick={describe}
                title="Draft a description from the title and details"
              >
                Write with AI
              </AiButton>
            )}
          </div>
          <textarea
            id="item-summary"
            rows={2}
            maxLength={2000}
            placeholder="One or two sentences your team will see on the card"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
          />
        </div>

        <label className="field">
          {kind === "tool" || kind === "prompt" ? "Notes for later (optional)" : "Details (optional)"}
          <textarea
            rows={2}
            maxLength={10000}
            placeholder="Add any extra context or instructions..."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
          />
        </label>

        {isTask && (
          <div className="field-row">
            <label className="field">
              Project
              <select
                value={projectId}
                onChange={(e) => {
                  const next = projects.find((p) => p.id === e.target.value);
                  setProjectId(e.target.value);
                  setMilestoneId("");
                  setMilestones([]);
                  if (next) setTeamId(next.team_id);
                }}
                disabled={editing && Boolean(item?.parent_id)}
              >
                <option value="">No project</option>
                {teamProjects
                  .filter((p) => !editing || p.team_id === teamId)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>
            </label>
            {inProject && (
              <label className="field">
                Milestone
                <select value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)}>
                  <option value="">No milestone</option>
                  {milestones.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="field">
              Status
              <select value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Priority
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <div className="field-row">
          {!editing && !inProject && writableTeams.length > 1 && (
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
          {(editing || inProject) && (
            <p className="field">
              Team
              <span className="readonly">{teams.find((t) => t.id === teamId)?.name}</span>
            </p>
          )}
          <fieldset className="field">
            <legend>Belongs to</legend>
            <div className="radio-row">
              <label>
                <input type="radio" checked={scope === "team"} onChange={() => setScope("team")} /> Team
              </label>
              <label>
                <input type="radio" checked={scope === "personal"} onChange={() => setScope("personal")} /> Personal
              </label>
            </div>
          </fieldset>
          {scope === "team" && isTask && (
            <label className="field">
              Assign to
              <select value={assignee} onChange={(e) => setAssignee(e.target.value)}>
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="field">
            Labels
            <input value={labels} onChange={(e) => setLabels(e.target.value)} placeholder="design, api" maxLength={330} />
          </label>
        </div>
        {scope === "personal" && (
          <p className="hint">Personal items are visible to your team with a hatch pattern. Only you and admins can edit them.</p>
        )}

        {!dateRequired && (
          <label className="check">
            <input type="checkbox" checked={onCalendar} onChange={(e) => setOnCalendar(e.target.checked)} />
            {isTask ? "Give it a due date (shows on the calendar)" : "Show on the calendar"}
          </label>
        )}

        {showDates && (
          <div className="field-row">
            <label className="field">
              {isTask ? "Date" : "Start date"}
              <input type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="field">
              End date (optional)
              <input type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
            </label>
            {kind === "event" && (
              <>
                <label className="field">
                  Start time
                  <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                </label>
                <label className="field">
                  End time
                  <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                </label>
              </>
            )}
          </div>
        )}

        {!item?.image_key && (
          <div className="cover-choice">
            <ImagePicker value={cover} onChange={setCover} />
            {!cover && aiEnabled && (
              <label className="check">
                <input type="checkbox" checked={aiCover} onChange={(e) => setAiCover(e.target.checked)} />
                No image? Generate a cover with AI after saving
              </label>
            )}
          </div>
        )}

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
            {busy ? "Saving..." : editing ? "Save changes" : `Add ${KIND_LABEL[kind]}`}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
