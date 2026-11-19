"use client";

import { useEffect, useMemo, useState } from "react";
import { ListTodo, Sparkles, Wrench } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { cleanLabel, type Mention, type MentionKind } from "@/lib/mentions";
import type { Member } from "@/lib/types";
import { Avatar } from "./WorkspaceShell";

export interface MentionOption extends Mention {
  /** Shown under the label: a project for tasks, "Library" for tools. */
  detail?: string;
  member?: Member;
}

const ITEM_KINDS: MentionKind[] = ["task", "tool", "prompt"];

/**
 * People in the conversation (filtered here) plus tasks, tools and prompts
 * from the organization (searched in the database, RLS-limited).
 */
export function useMentionSearch({
  query,
  orgId,
  people,
  projectName,
}: {
  query: string | null;
  orgId: string;
  people: Member[];
  projectName: (id: string | null) => string | undefined;
}) {
  const [items, setItems] = useState<{ q: string; list: MentionOption[] }>({ q: "", list: [] });

  useEffect(() => {
    if (query === null) return;
    const q = query;
    const timer = setTimeout(async () => {
      let request = supabaseBrowser()
        .from("items")
        .select("id, title, kind, project_id")
        .eq("org_id", orgId)
        .in("kind", ITEM_KINDS)
        .order("updated_at", { ascending: false })
        .limit(q ? 8 : 5);
      if (q) request = request.ilike("title", `%${q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
      const { data } = await request;
      const list = ((data ?? []) as { id: string; title: string; kind: MentionKind; project_id: string | null }[]).map(
        (row): MentionOption => ({
          kind: row.kind,
          id: row.id,
          label: cleanLabel(row.title) || "Untitled",
          detail: row.kind === "task" ? projectName(row.project_id) ?? "Task" : row.kind === "tool" ? "Library tool" : "Library prompt",
        }),
      );
      setItems({ q, list });
    }, 150);
    return () => clearTimeout(timer);
  }, [query, orgId, projectName]);

  return useMemo(() => {
    if (query === null) return [];
    const q = query.toLowerCase();
    const matchingPeople = people
      .filter((m) => m.full_name.toLowerCase().includes(q))
      .slice(0, 6)
      .map((m): MentionOption => ({ kind: "user", id: m.id, label: cleanLabel(m.full_name), detail: "Person", member: m }));
    // Item results from an older query would flash the wrong list; hide them.
    return [...matchingPeople, ...(items.q === query ? items.list : [])];
  }, [query, people, items]);
}

const ICON = { task: ListTodo, tool: Wrench, prompt: Sparkles } as const;

export function MentionList({
  options,
  active,
  onPick,
  onHover,
}: {
  options: MentionOption[];
  active: number;
  onPick: (option: MentionOption) => void;
  onHover: (index: number) => void;
}) {
  if (!options.length) {
    return (
      <div className="mention-picker" role="listbox" aria-label="Mention">
        <p className="muted small mention-empty">No people, tasks or tools match.</p>
      </div>
    );
  }
  return (
    <ul className="mention-picker" role="listbox" aria-label="Mention">
      {options.map((option, index) => {
        const Icon = option.kind === "user" ? null : ICON[option.kind];
        return (
          <li key={`${option.kind}:${option.id}`} role="option" aria-selected={index === active}>
            <button
              type="button"
              className="mention-option"
              // Keep focus in the textarea so typing carries on.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => onHover(index)}
              onClick={() => onPick(option)}
            >
              {option.member ? (
                <Avatar member={option.member} size={24} />
              ) : (
                Icon && (
                  <span className={`mention-icon mention-icon-${option.kind}`} aria-hidden="true">
                    <Icon size={13} />
                  </span>
                )
              )}
              <span className="mention-option-text">
                <strong>{option.label}</strong>
                {option.detail && <small>{option.detail}</small>}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
