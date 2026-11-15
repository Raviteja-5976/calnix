"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  CalendarDays,
  CheckSquare,
  FileText,
  FolderKanban,
  ListTodo,
  PenTool,
  Plus,
  Search,
  Terminal,
  Wrench,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useWorkspace } from "./WorkspaceShell";

interface Hit {
  kind: string;
  id: string;
  title: string;
  snippet: string | null;
  project_id: string | null;
}

interface Entry {
  key: string;
  label: string;
  hint?: string;
  icon: React.ElementType;
  run: () => void;
}

const ICONS: Record<string, React.ElementType> = {
  project: FolderKanban,
  task: CheckSquare,
  event: CalendarDays,
  tool: Wrench,
  prompt: Terminal,
  note: FileText,
  board: PenTool,
};

/** Ctrl+K: search everything, or jump to a page or action. */
export function CommandPalette({ onClose }: { onClose: () => void }) {
  const { org, openItem, newItem } = useWorkspace();
  const router = useRouter();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { data } = await supabaseBrowser().rpc("search_workspace", { p_org: org.id, p_query: q });
      if (!cancelled) {
        setHits((data ?? []) as Hit[]);
        setActive(0);
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, org.id]);

  // Unmounting the open dialog closes it; no ref needed.
  const close = onClose;
  const go = (href: string) => {
    close();
    router.push(href);
  };

  const q = query.trim().toLowerCase();
    const actions: Entry[] = [
      { key: "new-task", label: "New task", icon: Plus, run: () => (close(), newItem({ kind: "task" })) },
      { key: "new-event", label: "New event", icon: Plus, run: () => (close(), newItem({ kind: "event" })) },
      { key: "go-projects", label: "Go to Projects", icon: FolderKanban, run: () => go("/projects") },
      { key: "go-tasks", label: "Go to My tasks", icon: ListTodo, run: () => go("/tasks") },
      { key: "go-calendar", label: "Go to Calendar", icon: CalendarDays, run: () => go("/calendar") },
    ].filter((a) => !q || a.label.toLowerCase().includes(q));

    const found: Entry[] =
      q.length < 2
        ? []
        : hits
            // Docs outside a project are no longer reachable, so don't offer them.
            .filter((h) => !((h.kind === "note" || h.kind === "board") && !h.project_id))
            .map((h) => ({
            key: `${h.kind}-${h.id}`,
            label: h.title,
            hint: h.snippet ?? undefined,
            icon: ICONS[h.kind] ?? FileText,
            run: () => {
              if (h.kind === "project") go(`/projects/${h.id}`);
              else if (h.kind === "note" || h.kind === "board") {
                go(`/studio/${h.project_id}?doc=${h.id}`);
              } else {
                close();
                openItem(h.id);
              }
            },
          }));
  const entries: Entry[] = [...found, ...actions];

  function onKeyDown(event: React.KeyboardEvent) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => Math.min(entries.length - 1, i + 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      entries[active]?.run();
    }
  }

  return (
    <dialog ref={dialog} className="modal palette" onClose={onClose} aria-label="Search">
      <div className="palette-input">
        <Search size={18} aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (e.target.value.trim().length < 2) setHits([]);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search projects, tasks, docs… or type a command"
          aria-label="Search"
          role="combobox"
          aria-expanded="true"
          aria-controls="palette-list"
        />
        <kbd>Esc</kbd>
      </div>
      <ul id="palette-list" className="palette-list" role="listbox">
        {entries.map((entry, index) => {
          const Icon = entry.icon;
          return (
            <li
              key={entry.key}
              role="option"
              aria-selected={index === active}
              className={index === active ? "is-active" : ""}
              onMouseEnter={() => setActive(index)}
              onClick={entry.run}
            >
              <Icon size={16} aria-hidden="true" />
              <span className="palette-label">{entry.label}</span>
              {entry.hint && <span className="palette-hint">{entry.hint}</span>}
            </li>
          );
        })}
        {query.trim().length >= 2 && !hits.length && (
          <li className="palette-empty">
            No matches yet. Keep typing.
          </li>
        )}
      </ul>
    </dialog>
  );
}
