"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Edit2,
  ExternalLink,
  FolderKanban,
  ImagePlus,
  Link2,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { runAi } from "@/lib/ai/client";
import { compressImage } from "@/lib/compress-image";
import { dateRangeLabel, formatTime } from "@/lib/dates";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import { announceItemsChanged } from "@/lib/use-items";
import {
  KIND_LABEL,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  type Item,
  type Milestone,
  type Priority,
  type TaskStatus,
} from "@/lib/types";
import { AiButton } from "./AiButton";
import { uploadItemImage } from "./ImagePicker";
import { ItemCover } from "./ItemCover";
import { Avatar, useWorkspace } from "./WorkspaceShell";

const STALE_MS = 5 * 60 * 1000;
const isStale = (requestedAt: string | null) =>
  requestedAt !== null && Date.parse(requestedAt) < Date.now() - STALE_MS;

interface Related {
  subtasks: Item[];
  blockers: Item[];
  candidates: Item[];
  milestone: Milestone | null;
}

export function ItemDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { userId, isAdmin, teams, memberById, editItem, me, projects, org, aiEnabled, openItem } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [related, setRelated] = useState<Related>({ subtasks: [], blockers: [], candidates: [], milestone: null });
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [draft, setDraft] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [subtaskDrafts, setSubtaskDrafts] = useState<{ title: string; keep: boolean }[] | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const load = useCallback(async () => {
    const db = supabaseBrowser();
    const { data } = await db.from("items").select("*").eq("id", id).maybeSingle();
    const current = data as Item | null;
    setItem(current);
    if (!current || current.kind !== "task") return;
    const [subs, deps, milestone, siblings] = await Promise.all([
      db.from("items").select("*").eq("parent_id", id).order("position").order("created_at"),
      db.from("task_dependencies").select("depends_on_id").eq("task_id", id),
      current.milestone_id
        ? db.from("milestones").select("*").eq("id", current.milestone_id).maybeSingle()
        : Promise.resolve({ data: null }),
      current.project_id
        ? db.from("items").select("*").eq("project_id", current.project_id).is("parent_id", null).neq("id", id)
        : Promise.resolve({ data: [] }),
    ]);
    const blockerIds = new Set(((deps.data ?? []) as { depends_on_id: string }[]).map((d) => d.depends_on_id));
    const pool = (siblings.data ?? []) as Item[];
    let blockers = pool.filter((t) => blockerIds.has(t.id));
    if (blockers.length < blockerIds.size) {
      const { data: extra } = await db.from("items").select("*").in("id", [...blockerIds]);
      blockers = (extra ?? []) as Item[];
    }
    setRelated({
      subtasks: (subs.data ?? []) as Item[],
      blockers,
      candidates: pool.filter((t) => !blockerIds.has(t.id)),
      milestone: (milestone.data as Milestone | null) ?? null,
    });
  }, [id]);

  useEffect(() => {
    queueMicrotask(load);
    return subscribeToTable(`item-${id}`, { event: "*", table: "items", filter: `id=eq.${id}` }, () => load());
  }, [id, load]);

  const pending = item?.ai_status === "pending";
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  if (!item) {
    return (
      <dialog ref={dialog} className="drawer" onClose={onClose} aria-label="Item">
        <p className="muted drawer-loading">Loading item...</p>
      </dialog>
    );
  }

  const owner = memberById(item.owner_id);
  const assignee = memberById(item.assignee_id);
  const onTeam = me.teamIds.includes(item.team_id);
  const canEdit = isAdmin || (onTeam && (item.scope === "team" || item.owner_id === userId));
  const canDelete = isAdmin || item.owner_id === userId;
  const stale = pending && isStale(item.ai_requested_at);
  const project = projects.find((p) => p.id === item.project_id);
  const openBlockers = related.blockers.filter((b) => b.status !== "done");

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  async function update(changes: Partial<Item>) {
    const { error: failure } = await supabaseBrowser().from("items").update(changes).eq("id", item!.id);
    if (failure) throw new Error(failure.message);
    setItem({ ...item!, ...changes });
    announceItemsChanged();
  }

  const setStatus = (status: TaskStatus) =>
    run("status", async () => {
      if (status === "done" && openBlockers.length) {
        throw new Error(`Finish “${openBlockers[0].title}” first: this task is blocked by it.`);
      }
      await update({ status });
    });

  const generateCover = () =>
    run("cover", async () => {
      const response = await fetch(`/api/items/${item.id}/cover`, { method: "POST" });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).error ?? "Could not start the cover.");
      await load();
      announceItemsChanged();
    });

  const uploadCover = (file: File | undefined) =>
    file &&
    run("upload", async () => {
      await uploadItemImage(item.id, await compressImage(file));
      await load();
      announceItemsChanged();
      if (fileInput.current) fileInput.current.value = "";
    });

  const removeCover = () =>
    run("remove-cover", async () => {
      const response = await fetch(`/api/items/${item.id}/image`, { method: "DELETE" });
      if (!response.ok) throw new Error("Could not remove the image.");
      await load();
      announceItemsChanged();
    });

  const draftDescription = () =>
    run("describe", async () => {
      const result = await runAi("describe", org.id, {
        kind: item.kind,
        title: item.title,
        details: item.details,
        url: item.url,
        prompt_body: item.prompt_body,
      });
      setDraft(result.summary);
    });

  const addSubtask = (title: string) =>
    supabaseBrowser()
      .from("items")
      .insert({
        team_id: item.team_id,
        kind: "task",
        scope: item.scope,
        title,
        project_id: item.project_id,
        parent_id: item.id,
        // A subtask outside a project still needs a date to exist.
        start_date: item.project_id ? null : item.start_date,
        end_date: item.project_id ? null : item.start_date,
        position: related.subtasks.length,
      });

  const breakDown = () =>
    run("breakdown", async () => {
      const result = await runAi("breakdown", org.id, {
        projectId: item.project_id,
        target: "task",
        title: item.title,
        details: item.details,
      });
      setSubtaskDrafts(result.tasks.map((t) => ({ title: t.title, keep: true })));
    });

  async function remove() {
    const response = await fetch(`/api/items/${item!.id}`, { method: "DELETE" });
    if (!response.ok) {
      setError((await response.json().catch(() => ({}))).error ?? "Could not delete this item.");
      return;
    }
    announceItemsChanged();
    dialog.current?.close();
  }

  async function copyPrompt() {
    if (!item?.prompt_body) return;
    await navigator.clipboard.writeText(item.prompt_body);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const time = item.start_time
    ? ` at ${formatTime(item.start_time)}${item.end_time ? ` to ${formatTime(item.end_time)}` : ""}`
    : "";

  return (
    <dialog ref={dialog} className="drawer" onClose={onClose} aria-labelledby="drawer-title">
      <div className="drawer-cover">
        <ItemCover item={item} />
        <button className="btn-plain drawer-close" onClick={() => dialog.current?.close()} aria-label="Close drawer">
          <X size={16} />
          <span>Close</span>
        </button>
      </div>
      <div className="drawer-body stack">
        {canEdit && (
          <div className="cover-actions">
            <button className="btn btn-small" onClick={() => fileInput.current?.click()} disabled={busy === "upload"}>
              <ImagePlus size={13} />
              <span>{busy === "upload" ? "Uploading…" : item.image_key ? "Replace image" : "Upload image"}</span>
            </button>
            {aiEnabled && (!pending || stale) && (
              <AiButton busy={busy === "cover"} onClick={generateCover}>
                {item.image_source === "ai" ? "Redraw cover" : item.image_key ? "Generate instead" : "Generate cover"}
              </AiButton>
            )}
            {item.image_key && (
              <button className="btn btn-small" onClick={removeCover} disabled={busy === "remove-cover"}>
                <X size={13} />
                <span>Remove image</span>
              </button>
            )}
            <input ref={fileInput} type="file" accept="image/*" hidden onChange={(e) => uploadCover(e.target.files?.[0])} />
          </div>
        )}

        <p className={`tag tag-${item.kind}`}>
          {KIND_LABEL[item.kind]}
          {item.scope === "personal" ? " · Personal" : " · Team"}
          {item.parent_id ? " · Subtask" : ""}
        </p>
        <h2 id="drawer-title" className={item.status === "done" ? "is-done" : ""}>
          {item.title}
        </h2>

        <div className="ai-note" aria-live="polite">
          {pending && !stale && (
            <p className="hint inline-icon">
              <Sparkles size={14} /> Drawing the cover image…
            </p>
          )}
          {stale && <p className="muted">The cover took longer than usual. Try again.</p>}
          {item.ai_status === "failed" && <p className="error">{item.ai_error ?? "Could not generate the cover."}</p>}
          {item.summary && <p>{item.summary}</p>}
          {!item.summary && draft === null && canEdit && aiEnabled && (
            <AiButton busy={busy === "describe"} onClick={draftDescription}>
              Write a description
            </AiButton>
          )}
          {draft !== null && (
            <div className="ai-draft">
              <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={3} maxLength={2000} />
              <div className="row-gap">
                <button
                  className="btn btn-primary btn-small"
                  onClick={() =>
                    run("save-summary", async () => {
                      await update({ summary: draft.trim() || null });
                      setDraft(null);
                    })
                  }
                >
                  Save description
                </button>
                <button className="btn btn-small" onClick={() => setDraft(null)}>
                  Discard
                </button>
              </div>
            </div>
          )}
        </div>

        {item.kind === "task" && (
          <div className="task-controls">
            <label className="field">
              Status
              <select
                value={item.status}
                disabled={!canEdit || busy === "status"}
                onChange={(e) => setStatus(e.target.value as TaskStatus)}
                className={`status-select status-${item.status}`}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Priority
              <select
                value={item.priority}
                disabled={!canEdit}
                onChange={(e) => run("priority", () => update({ priority: e.target.value as Priority }))}
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <dl className="meta">
          {project && (
            <div>
              <dt>Project</dt>
              <dd>
                <Link href={`/projects/${project.id}`} className="inline-icon" onClick={() => dialog.current?.close()}>
                  <FolderKanban size={14} />
                  {project.name}
                </Link>
                {related.milestone && <span className="muted"> · {related.milestone.title}</span>}
              </dd>
            </div>
          )}
          {item.start_date && (
            <div>
              <dt>{item.kind === "task" ? "Due" : "When"}</dt>
              <dd>
                {dateRangeLabel(item.start_date, item.end_date)}
                {time}
              </dd>
            </div>
          )}
          <div>
            <dt>Team</dt>
            <dd>{teams.find((t) => t.id === item.team_id)?.name ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Added by</dt>
            <dd className="person">
              <Avatar member={owner} size={20} />
              <span>{owner?.full_name ?? "Former member"}</span>
            </dd>
          </div>
          {assignee && (
            <div>
              <dt>Assigned to</dt>
              <dd className="person">
                <Avatar member={assignee} size={20} />
                <span>{assignee.full_name}</span>
              </dd>
            </div>
          )}
          {item.labels.length > 0 && (
            <div>
              <dt>Labels</dt>
              <dd className="label-row">
                {item.labels.map((l) => (
                  <span key={l} className="label-chip">
                    {l}
                  </span>
                ))}
              </dd>
            </div>
          )}
        </dl>

        {item.url && (
          <a className="tool-link inline-icon" href={item.url} target="_blank" rel="noopener noreferrer">
            <ExternalLink size={14} />
            <span>{item.url}</span>
          </a>
        )}
        {item.details && <p className="details">{item.details}</p>}
        {item.prompt_body && (
          <div className="prompt-block">
            <button className="btn btn-small" onClick={copyPrompt}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              <span>{copied ? "Copied" : "Copy prompt"}</span>
            </button>
            <pre>{item.prompt_body}</pre>
          </div>
        )}

        {item.kind === "task" && !item.parent_id && (
          <section className="drawer-section">
            <div className="section-head">
              <h3>Subtasks</h3>
              {canEdit && aiEnabled && item.project_id && (
                <AiButton busy={busy === "breakdown"} onClick={breakDown}>
                  Break down
                </AiButton>
              )}
            </div>
            {related.subtasks.length > 0 && (
              <ul className="subtask-list">
                {related.subtasks.map((s) => (
                  <li key={s.id}>
                    <input
                      type="checkbox"
                      checked={s.status === "done"}
                      disabled={!canEdit}
                      aria-label={`Mark ${s.title} done`}
                      onChange={() =>
                        run("subtask", async () => {
                          await supabaseBrowser()
                            .from("items")
                            .update({ status: s.status === "done" ? "todo" : "done" })
                            .eq("id", s.id);
                          await load();
                          announceItemsChanged();
                        })
                      }
                    />
                    <button className={`link-button${s.status === "done" ? " is-done" : ""}`} onClick={() => openItem(s.id)}>
                      {s.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {subtaskDrafts && (
              <div className="ai-draft">
                <p className="hint">AI suggestions. Untick any you don&apos;t want.</p>
                <ul className="draft-list">
                  {subtaskDrafts.map((d, i) => (
                    <li key={i}>
                      <label className="check">
                        <input
                          type="checkbox"
                          checked={d.keep}
                          onChange={() =>
                            setSubtaskDrafts(subtaskDrafts.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)))
                          }
                        />
                        <input
                          className="inline-input"
                          value={d.title}
                          onChange={(e) =>
                            setSubtaskDrafts(subtaskDrafts.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))
                          }
                        />
                      </label>
                    </li>
                  ))}
                </ul>
                <div className="row-gap">
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() =>
                      run("add-drafts", async () => {
                        for (const d of subtaskDrafts.filter((x) => x.keep && x.title.trim())) {
                          const { error: failure } = await addSubtask(d.title.trim().slice(0, 200));
                          if (failure) throw new Error(failure.message);
                        }
                        setSubtaskDrafts(null);
                        await load();
                        announceItemsChanged();
                      })
                    }
                  >
                    Add selected
                  </button>
                  <button className="btn btn-small" onClick={() => setSubtaskDrafts(null)}>
                    Discard
                  </button>
                </div>
              </div>
            )}
            {canEdit && (
              <form
                className="inline-add"
                onSubmit={(e) => {
                  e.preventDefault();
                  const title = subtaskTitle.trim();
                  if (!title) return;
                  run("subtask-add", async () => {
                    const { error: failure } = await addSubtask(title.slice(0, 200));
                    if (failure) throw new Error(failure.message);
                    setSubtaskTitle("");
                    await load();
                    announceItemsChanged();
                  });
                }}
              >
                <input value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="Add a subtask" />
                <button className="btn btn-small" disabled={!subtaskTitle.trim()}>
                  <Plus size={13} />
                  <span>Add</span>
                </button>
              </form>
            )}
          </section>
        )}

        {item.kind === "task" && item.project_id && !item.parent_id && (
          <section className="drawer-section">
            <h3>Blocked by</h3>
            {related.blockers.length > 0 ? (
              <ul className="blocker-list">
                {related.blockers.map((b) => (
                  <li key={b.id}>
                    <Link2 size={13} aria-hidden="true" />
                    <button className={`link-button${b.status === "done" ? " is-done" : ""}`} onClick={() => openItem(b.id)}>
                      {b.title}
                    </button>
                    <span className={`status-pill status-${b.status}`}>{STATUS_LABEL[b.status]}</span>
                    {canEdit && (
                      <button
                        className="btn-plain"
                        aria-label={`Remove dependency on ${b.title}`}
                        onClick={() =>
                          run("dep", async () => {
                            await supabaseBrowser()
                              .from("task_dependencies")
                              .delete()
                              .eq("task_id", item.id)
                              .eq("depends_on_id", b.id);
                            await load();
                          })
                        }
                      >
                        <X size={13} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint">Nothing. Add a task that has to finish first.</p>
            )}
            {canEdit && related.candidates.length > 0 && (
              <select
                value=""
                aria-label="Add a blocking task"
                onChange={(e) =>
                  e.target.value &&
                  run("dep", async () => {
                    const { error: failure } = await supabaseBrowser()
                      .from("task_dependencies")
                      .insert({ task_id: item.id, depends_on_id: e.target.value });
                    if (failure) throw new Error(failure.message);
                    await load();
                  })
                }
              >
                <option value="">+ Add a blocking task…</option>
                {related.candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            )}
          </section>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="drawer-actions">
          {item.kind === "task" && canEdit && (
            <button className="btn btn-primary" onClick={() => setStatus(item.status === "done" ? "todo" : "done")}>
              <Check size={14} />
              <span>{item.status === "done" ? "Reopen task" : "Mark done"}</span>
            </button>
          )}
          {canEdit && (
            <button
              className="btn"
              onClick={() => {
                dialog.current?.close();
                editItem(item);
              }}
            >
              <Edit2 size={14} />
              <span>Edit</span>
            </button>
          )}
          {canDelete && !confirming && (
            <button className="btn btn-danger" onClick={() => setConfirming(true)}>
              <Trash2 size={14} />
              <span>Delete</span>
            </button>
          )}
          {canDelete && confirming && (
            <>
              <button className="btn btn-danger-solid" onClick={remove}>
                Delete permanently
              </button>
              <button className="btn" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </>
          )}
        </div>
        {!canEdit && (
          <p className="hint">
            This is {owner?.full_name ?? "a teammate"}&apos;s personal item, so you can view it but not modify it.
          </p>
        )}
      </div>
    </dialog>
  );
}
