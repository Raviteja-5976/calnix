"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { CheckSquare, Calendar, Wrench, Terminal, X, Sparkles } from "lucide-react";
import { itemInput, type ItemInput } from "@/lib/item-input";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { announceItemsChanged } from "@/lib/use-items";
import { KIND_LABEL, type Item, type ItemKind, type ItemScope } from "@/lib/types";
import { useWorkspace } from "./WorkspaceShell";

export interface ItemDefaults {
  kind?: ItemKind;
  start_date?: string;
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
  const { writableTeams, members, teams, me } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const editing = Boolean(item);

  const [kind, setKind] = useState<ItemKind>(item?.kind ?? defaults?.kind ?? "task");
  const [scope, setScope] = useState<ItemScope>(item?.scope ?? "team");
  const [teamId, setTeamId] = useState(
    item?.team_id ??
      writableTeams.find((t) => me.teamIds.includes(t.id))?.id ??
      writableTeams[0]?.id ??
      ""
  );
  const [onCalendar, setOnCalendar] = useState(Boolean(item?.start_date ?? defaults?.start_date));
  const [start, setStart] = useState(item?.start_date ?? defaults?.start_date ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const needsDate = kind === "task" || kind === "event";
  const showDates = needsDate || onCalendar;
  const teamMembers = members.filter((m) => m.teamIds.includes(teamId));

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => (form.get(name) as string | null) ?? "";

    const parsed = itemInput.safeParse({
      team_id: teamId,
      kind,
      scope,
      title: text("title"),
      details: text("details"),
      url: kind === "tool" ? text("url") : "",
      prompt_body: kind === "prompt" ? text("prompt_body") : "",
      start_date: showDates ? start : "",
      end_date: showDates ? text("end_date") : "",
      start_time: showDates && kind === "event" ? text("start_time") : "",
      end_time: showDates && kind === "event" ? text("end_time") : "",
      assignee_id: scope === "team" && kind === "task" ? text("assignee_id") : "",
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form values");
      return;
    }

    setBusy(true);
    setError(null);

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
      setBusy(false);
      if (failure || !data?.length) {
        setError(failure?.message ?? "You can only edit items you have permission for.");
        return;
      }
      announceItemsChanged();
      onSaved(item.id);
      return;
    }

    const response = await fetch("/api/items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parsed.data),
    });
    const result = await response.json().catch(() => ({}));
    const savedId = result.item?.id ?? result.id;
    setBusy(false);
    if (!response.ok || !savedId) {
      setError(result.error ?? "Could not save. Try again.");
      return;
    }
    announceItemsChanged();
    onSaved(savedId);
  }

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="item-form-title">
      <form onSubmit={submit} className="stack">
        <header className="modal-head">
          <h2 id="item-form-title">
            {editing ? `Edit ${KIND_LABEL[kind]}` : "Add to Calnix"}
          </h2>
          <button
            type="button"
            className="btn-plain"
            onClick={() => dialog.current?.close()}
            aria-label="Close dialog"
          >
            <X size={16} />
            <span>Close</span>
          </button>
        </header>

        {!writableTeams.length && (
          <p className="error">You need to join a team before adding items.</p>
        )}

        {!editing && (
          <fieldset className="segmented">
            <legend className="sr-only">Type</legend>
            {KINDS.map((k) => {
              const Icon = KIND_ICONS[k];
              return (
                <label key={k} className={`seg seg-${k}`}>
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === k}
                    onChange={() => setKind(k)}
                  />
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
            name="title"
            required
            maxLength={200}
            defaultValue={item?.title}
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
            <input
              name="url"
              type="url"
              required
              placeholder="https://..."
              defaultValue={item?.url ?? ""}
            />
          </label>
        )}

        {kind === "prompt" && (
          <label className="field">
            Prompt text
            <textarea
              name="prompt_body"
              required
              rows={5}
              maxLength={50000}
              placeholder="Enter your reusable AI prompt here..."
              defaultValue={item?.prompt_body ?? ""}
            />
          </label>
        )}

        <label className="field">
          {kind === "tool" || kind === "prompt"
            ? "Notes for later (optional)"
            : "Details (optional)"}
          <textarea
            name="details"
            rows={2}
            maxLength={10000}
            placeholder="Add any extra context or instructions..."
            defaultValue={item?.details ?? ""}
          />
        </label>

        <div className="field-row">
          {!editing && writableTeams.length > 1 && (
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
          {editing && (
            <p className="field">
              Team
              <span className="readonly">
                {teams.find((t) => t.id === teamId)?.name}
              </span>
            </p>
          )}
          <fieldset className="field">
            <legend>Belongs to</legend>
            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  checked={scope === "team"}
                  onChange={() => setScope("team")}
                />{" "}
                Team
              </label>
              <label>
                <input
                  type="radio"
                  checked={scope === "personal"}
                  onChange={() => setScope("personal")}
                />{" "}
                Personal
              </label>
            </div>
          </fieldset>
          {scope === "team" && kind === "task" && (
            <label className="field">
              Assign to
              <select name="assignee_id" defaultValue={item?.assignee_id ?? ""}>
                <option value="">Unassigned</option>
                {teamMembers.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {scope === "personal" && (
          <p className="hint">
            Personal items are visible to your team with distinctive hatch pattern. Only you and admins can edit them.
          </p>
        )}

        {!needsDate && (
          <label className="check">
            <input
              type="checkbox"
              checked={onCalendar}
              onChange={(e) => setOnCalendar(e.target.checked)}
            />
            Show on the calendar
          </label>
        )}

        {showDates && (
          <div className="field-row">
            <label className="field">
              Start date
              <input
                type="date"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            <label className="field">
              End date (optional for multi-day)
              <input
                name="end_date"
                type="date"
                min={start || undefined}
                defaultValue={
                  item?.end_date !== item?.start_date ? item?.end_date ?? "" : ""
                }
              />
            </label>
            {kind === "event" && (
              <>
                <label className="field">
                  Start time
                  <input
                    name="start_time"
                    type="time"
                    defaultValue={item?.start_time?.slice(0, 5) ?? ""}
                  />
                </label>
                <label className="field">
                  End time
                  <input
                    name="end_time"
                    type="time"
                    defaultValue={item?.end_time?.slice(0, 5) ?? ""}
                  />
                </label>
              </>
            )}
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <footer className="modal-foot">
          {!editing && (
            <p className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
              <Sparkles size={13} /> AI generates summary and artwork after saving.
            </p>
          )}
          <button className="btn btn-primary" disabled={busy || !teamId}>
            {busy ? "Saving..." : editing ? "Save changes" : `Add ${KIND_LABEL[kind]}`}
          </button>
        </footer>
      </form>
    </dialog>
  );
}
