"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, Copy, Edit2, ExternalLink, RefreshCw, Sparkles, Trash2, X } from "lucide-react";
import { dateRangeLabel, formatTime } from "@/lib/dates";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import { announceItemsChanged } from "@/lib/use-items";
import { KIND_LABEL, type Item } from "@/lib/types";
import { ItemCover } from "./ItemCover";
import { Avatar, useWorkspace } from "./WorkspaceShell";

const STALE_MS = 5 * 60 * 1000;
const isStale = (requestedAt: string | null) =>
  requestedAt !== null && Date.parse(requestedAt) < Date.now() - STALE_MS;

export function ItemDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const { userId, isAdmin, teams, memberById, editItem, me } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser().from("items").select("*").eq("id", id).maybeSingle();
    setItem(data as Item | null);
  }, [id]);

  useEffect(() => {
    queueMicrotask(load);
    return subscribeToTable(
      `item-${id}`,
      { event: "*", table: "items", filter: `id=eq.${id}` },
      () => load()
    );
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

  async function toggleDone() {
    if (!item) return;
    const status = item.status === "done" ? "todo" : "done";
    const { error: failure } = await supabaseBrowser()
      .from("items")
      .update({ status })
      .eq("id", item.id);
    if (failure) setError("Could not update this task.");
    else {
      setItem({ ...item, status });
      announceItemsChanged();
    }
  }

  async function regenerate() {
    if (!item) return;
    setError(null);
    const response = await fetch(`/api/items/${item.id}/ai`, { method: "POST" });
    if (!response.ok) setError("You cannot change this item.");
    await load();
    announceItemsChanged();
  }

  async function remove() {
    if (!item) return;
    const response = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
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
        <button
          className="btn-plain drawer-close"
          onClick={() => dialog.current?.close()}
          aria-label="Close drawer"
        >
          <X size={16} />
          <span>Close</span>
        </button>
      </div>
      <div className="drawer-body stack">
        <p className={`tag tag-${item.kind}`}>
          {KIND_LABEL[item.kind]}
          {item.scope === "personal" ? " · Personal" : " · Team"}
        </p>
        <h2 id="drawer-title" className={item.status === "done" ? "is-done" : ""}>
          {item.title}
        </h2>

        <div className="ai-note" aria-live="polite">
          {pending && !stale && (
            <p className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={14} /> Creating AI description and imagery...
            </p>
          )}
          {stale && <p className="muted">Generation took longer than usual. Try refreshing it.</p>}
          {item.ai_status === "failed" && (
            <p className="error">{item.ai_error ?? "Could not generate artwork."}</p>
          )}
          {item.ai_description && <p>{item.ai_description}</p>}
        </div>

        <dl className="meta">
          <div>
            <dt>When</dt>
            <dd>
              {dateRangeLabel(item.start_date, item.end_date)}
              {time}
            </dd>
          </div>
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
        </dl>

        {item.url && (
          <a
            className="tool-link"
            href={item.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
          >
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

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className="drawer-actions">
          {item.kind === "task" && canEdit && (
            <button className="btn btn-primary" onClick={toggleDone}>
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
          {canEdit && (!pending || stale) && (
            <button className="btn" onClick={regenerate}>
              <RefreshCw size={14} />
              <span>{item.ai_status === "ready" ? "Redraw image" : "Try again"}</span>
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
            This is {owner?.full_name ?? "a teammate"}&apos;s personal item, so you can view it but not
            modify it.
          </p>
        )}
      </div>
    </dialog>
  );
}
