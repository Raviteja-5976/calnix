"use client";

import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, Wrench, Terminal } from "lucide-react";
import { useItems } from "@/lib/use-items";
import { KIND_LABEL, type ItemKind } from "@/lib/types";
import { ItemCover } from "./ItemCover";
import { Avatar, useWorkspace } from "./WorkspaceShell";

const KINDS: ItemKind[] = ["tool", "prompt"];

export function LibraryView() {
  const { org, teams, newItem, openItem, memberById } = useWorkspace();
  const { items, loading, error } = useItems({ orgId: org.id, kinds: KINDS });
  const [kind, setKind] = useState<"all" | ItemKind>("all");
  const [search, setSearch] = useState("");

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter(
      (i) =>
        (kind === "all" || i.kind === kind) &&
        (!needle ||
          [i.title, i.details, i.ai_description, i.prompt_body, i.url].some((text) =>
            text?.toLowerCase().includes(needle)
          ))
    );
  }, [items, kind, search]);

  return (
    <main className="page">
      <header className="page-head">
        <h1>Library</h1>
        <p className="muted">Tools and prompts your team wants to keep for later.</p>
        <div className="page-actions">
          <button className="btn" onClick={() => newItem({ kind: "prompt" })}>
            <Terminal size={14} />
            <span>Add prompt</span>
          </button>
          <button className="btn btn-primary" onClick={() => newItem({ kind: "tool" })}>
            <Plus size={14} />
            <span>Add tool</span>
          </button>
        </div>
      </header>

      <div className="cal-filters">
        <div className="btn-group" role="group" aria-label="Type">
          {(["all", "tool", "prompt"] as const).map((k) => (
            <button
              key={k}
              className="btn btn-small"
              aria-pressed={kind === k}
              onClick={() => setKind(k)}
            >
              {k === "all" ? "All" : `${KIND_LABEL[k]}s`}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="search"
          placeholder="Search titles, notes and prompt text..."
          aria-label="Search the library"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      {!loading && !visible.length && (
        <p className="muted empty">
          {items.length
            ? "Nothing matches that search."
            : "Add a tool or prompt and AI will describe it and draw a cover for it."}
        </p>
      )}

      <ul className="library-grid">
        {visible.map((item) => (
          <li key={item.id}>
            <button className="library-item" onClick={() => openItem(item.id)}>
              <ItemCover item={item} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className={`tag tag-${item.kind}`}>
                  {item.kind === "tool" ? (
                    <Wrench size={12} style={{ marginRight: 3 }} />
                  ) : (
                    <Terminal size={12} style={{ marginRight: 3 }} />
                  )}
                  {KIND_LABEL[item.kind]}
                  {item.scope === "personal" ? " · Personal" : ""}
                </span>
                {item.ai_status === "pending" && (
                  <span className="hint" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                    <Sparkles size={12} /> Generating
                  </span>
                )}
              </div>
              <strong>{item.title}</strong>
              <span className="muted clamp-3">
                {item.ai_description ??
                  (item.ai_status === "pending"
                    ? "Creating the description and artwork..."
                    : item.details ?? "")}
              </span>
              <span className="library-foot">
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <Avatar member={memberById(item.owner_id)} size={20} />
                  <span>{memberById(item.owner_id)?.full_name ?? "Team member"}</span>
                </span>
                <span>{teams.find((t) => t.id === item.team_id)?.name}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </main>
  );
}
