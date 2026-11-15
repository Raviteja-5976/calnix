"use client";

import dynamic from "next/dynamic";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  FileText,
  Folder,
  FolderPlus,
  MoreHorizontal,
  PenTool,
  Plus,
  RotateCcw,
  Trash2,
  Archive,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { relativeTime } from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Doc, DocKind, DocSummary, Folder as FolderRow } from "@/lib/types";
import { download, safeFilename, zipFiles } from "@/lib/zip";
import { useWorkspace } from "../WorkspaceShell";
import { NoteEditor } from "./NoteEditor";

// Excalidraw is large and browser-only: load it only when a board opens.
const WhiteboardEditor = dynamic(() => import("./WhiteboardEditor").then((m) => m.WhiteboardEditor), {
  ssr: false,
  loading: () => <p className="muted">Loading whiteboard…</p>,
});

const SUMMARY = "id, team_id, project_id, folder_id, kind, title, version, deleted_at, updated_at, updated_by";

interface Scope {
  teamId: string;
  projectId: string;
  /** Shown at the top of the file sidebar, e.g. the project name and a way back. */
  sidebarHeader?: React.ReactNode;
}

/** A project's nested folders of docs and whiteboards, with the open item beside them. */
export function DocsWorkspace({ teamId, projectId, sidebarHeader }: Scope) {
  const { me, isAdmin } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const openId = params.get("doc");

  const [folders, setFolders] = useState<FolderRow[]>([]);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [open, setOpen] = useState<Doc | null>(null);
  const [openKey, setOpenKey] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [showTrash, setShowTrash] = useState(false);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filesHidden, setFilesHidden] = useState(false);
  // Phones: the file tree is a drawer, closed until asked for.
  const [mobileFiles, setMobileFiles] = useState(false);
  const loadTicket = useRef(0);

  const canEdit = isAdmin || me.teamIds.includes(teamId);

  const load = useCallback(async () => {
    const ticket = ++loadTicket.current;
    const db = supabaseBrowser();
    const f = db.from("folders").select("*").eq("project_id", projectId);
    const d = db.from("documents").select(SUMMARY).eq("project_id", projectId);
    const [fr, dr] = await Promise.all([f.order("position").order("name"), d.order("title")]);
    if (ticket !== loadTicket.current) return;
    setFolders((fr.data ?? []) as FolderRow[]);
    setDocs((dr.data ?? []) as DocSummary[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    queueMicrotask(load);
  }, [load]);

  const loadDoc = useCallback(async (id: string) => {
    const { data } = await supabaseBrowser().from("documents").select("*").eq("id", id).maybeSingle();
    setOpen(data as Doc | null);
    setOpenKey((k) => k + 1);
  }, []);

  useEffect(() => {
    if (!openId) {
      queueMicrotask(() => setOpen(null));
      return;
    }
    queueMicrotask(() => loadDoc(openId));
  }, [openId, loadDoc]);

  const select = useCallback(
    (id: string | null) => {
      setMobileFiles(false);
      const next = new URLSearchParams(params.toString());
      if (id) next.set("doc", id);
      else next.delete("doc");
      router.push(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const live = docs.filter((d) => !d.deleted_at);
  const liveFolders = folders.filter((f) => !f.deleted_at);
  const titles = useMemo(() => [...new Set(live.map((d) => d.title))].sort(), [live]);

  async function create(kind: DocKind, folderId: string | null, title?: string, content = "") {
    setMenu(null);
    const { data, error: failure } = await supabaseBrowser()
      .from("documents")
      .insert({
        team_id: teamId,
        project_id: projectId,
        folder_id: folderId,
        kind,
        title: title ?? (kind === "board" ? "Untitled board" : "Untitled"),
        content,
      })
      .select(SUMMARY)
      .single();
    if (failure || !data) return setError(failure?.message ?? "Could not create it.");
    if (folderId) setCollapsed((c) => new Set([...c].filter((x) => x !== folderId)));
    await load();
    select(data.id);
  }

  async function createFolder(parentId: string | null) {
    setMenu(null);
    const name = window.prompt("Folder name", "New folder")?.trim();
    if (!name) return;
    const { error: failure } = await supabaseBrowser()
      .from("folders")
      .insert({ team_id: teamId, project_id: projectId, parent_id: parentId, name: name.slice(0, 120), position: liveFolders.length });
    if (failure) setError(failure.message);
    load();
  }

  async function rename(kind: "folder" | "doc", id: string, current: string) {
    setMenu(null);
    const name = window.prompt("New name", current)?.trim();
    if (!name || name === current) return;
    const { error: failure } =
      kind === "folder"
        ? await supabaseBrowser().from("folders").update({ name: name.slice(0, 120) }).eq("id", id)
        : await supabaseBrowser().from("documents").update({ title: name.slice(0, 200) }).eq("id", id);
    if (failure) setError(failure.message);
    load();
    if (kind === "doc" && open?.id === id) loadDoc(id);
  }

  async function move(kind: "folder" | "doc", id: string, folderId: string | null) {
    setMenu(null);
    if (kind === "folder" && id === folderId) return;
    const { error: failure } =
      kind === "folder"
        ? await supabaseBrowser().from("folders").update({ parent_id: folderId }).eq("id", id)
        : await supabaseBrowser().from("documents").update({ folder_id: folderId }).eq("id", id);
    if (failure) setError(failure.message.includes("inside itself") ? "A folder can't go inside itself." : failure.message);
    load();
  }

  async function trash(kind: "folder" | "doc", id: string, restore = false) {
    setMenu(null);
    const db = supabaseBrowser();
    const { error: failure } =
      kind === "folder"
        ? await db.rpc("set_folder_trashed", { p_folder: id, p_trashed: !restore })
        : await db.from("documents").update({ deleted_at: restore ? null : new Date().toISOString() }).eq("id", id);
    if (failure) setError(failure.message);
    if (!restore && (open?.id === id || (kind === "folder" && open?.folder_id === id))) select(null);
    load();
  }

  async function destroy(kind: "folder" | "doc", id: string) {
    if (!window.confirm("Delete this permanently? This can't be undone.")) return;
    const { data, error: failure } =
      kind === "folder"
        ? await supabaseBrowser().from("folders").delete().eq("id", id).select("id")
        : await supabaseBrowser().from("documents").delete().eq("id", id).select("id");
    if (failure || !data?.length) setError(failure?.message ?? "Only the creator or an admin can delete this for good.");
    load();
  }

  async function exportAll() {
    const { data } = await supabaseBrowser()
      .from("documents")
      .select("title, content, folder_id")
      .eq("project_id", projectId)
      .eq("kind", "note")
      .is("deleted_at", null);
    const byId = new Map(liveFolders.map((f) => [f.id, f]));
    const pathOf = (folderId: string | null): string => {
      const parts: string[] = [];
      for (let f = folderId ? byId.get(folderId) : undefined; f; f = f.parent_id ? byId.get(f.parent_id) : undefined) {
        parts.unshift(safeFilename(f.name));
      }
      return parts.length ? `${parts.join("/")}/` : "";
    };
    const used = new Set<string>();
    const files = ((data ?? []) as { title: string; content: string; folder_id: string | null }[]).map((d) => {
      let path = `${pathOf(d.folder_id)}${safeFilename(d.title)}.md`;
      for (let n = 2; used.has(path); n++) path = `${pathOf(d.folder_id)}${safeFilename(d.title)} (${n}).md`;
      used.add(path);
      return { path, content: d.content };
    });
    if (!files.length) return setError("There are no notes to export yet.");
    download(zipFiles(files), "docs.zip");
  }

  const openByTitle = useCallback(
    async (title: string) => {
      const wanted = title.trim().toLowerCase();
      const local = live.find((d) => d.title.toLowerCase() === wanted);
      if (local) return select(local.id);
      // Not in this project: look in the team's other projects before offering to create it.
      const { data } = await supabaseBrowser()
        .from("documents")
        .select("id, project_id")
        .eq("team_id", teamId)
        .not("project_id", "is", null)
        .is("deleted_at", null)
        .ilike("title", title.replace(/[%_\\]/g, (c) => `\\${c}`))
        .limit(1)
        .maybeSingle();
      if (data) {
        router.push(`/studio/${data.project_id}?doc=${data.id}`);
        return;
      }
      if (canEdit && window.confirm(`No doc called “${title}” yet. Create it?`)) create("note", open?.folder_id ?? null, title.slice(0, 200));
    },
    // create is stable enough for this handler; it reads current scope.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [live, select, teamId, router, canEdit, open?.folder_id],
  );

  const rename_ = (id: string, title: string) =>
    setDocs((list) => list.map((d) => (d.id === id ? { ...d, title } : d)));

  function Menu({ kind, id, name }: { kind: "folder" | "doc"; id: string; name: string }) {
    const targets = liveFolders.filter((f) => f.id !== id);
    return (
      <div className="menu tree-menu" role="menu" onMouseLeave={() => setMenu(null)}>
        {kind === "folder" && (
          <>
            <button role="menuitem" onClick={() => create("note", id)}>
              New note here
            </button>
            <button role="menuitem" onClick={() => create("board", id)}>
              New whiteboard here
            </button>
            <button role="menuitem" onClick={() => createFolder(id)}>
              New subfolder
            </button>
          </>
        )}
        <button role="menuitem" onClick={() => rename(kind, id, name)}>
          Rename
        </button>
        <label className="menu-select">
          Move to
          <select value="" onChange={(e) => move(kind, id, e.target.value === "root" ? null : e.target.value)}>
            <option value="">Choose…</option>
            <option value="root">Top level</option>
            {targets.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        </label>
        <button role="menuitem" className="danger" onClick={() => trash(kind, id)}>
          Move to trash
        </button>
      </div>
    );
  }

  function dropProps(folderId: string | null) {
    const key = folderId ?? "root";
    return {
      onDragOver: (e: React.DragEvent) => {
        if (!canEdit) return;
        e.preventDefault();
        e.stopPropagation();
        setDragOver(key);
      },
      onDragLeave: () => setDragOver(null),
      onDrop: (e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(null);
        const [kind, id] = e.dataTransfer.getData("text/tree-node").split(":");
        if (kind && id) move(kind as "folder" | "doc", id, folderId);
      },
    };
  }

  const dragProps = (kind: "folder" | "doc", id: string) => ({
    draggable: canEdit,
    onDragStart: (e: React.DragEvent) => {
      e.stopPropagation();
      e.dataTransfer.setData("text/tree-node", `${kind}:${id}`);
    },
  });

  function Branch({ parentId, depth }: { parentId: string | null; depth: number }) {
    const childFolders = liveFolders.filter((f) => f.parent_id === parentId);
    const childDocs = live.filter((d) => d.folder_id === parentId);
    return (
      <ul className="tree" role={depth === 0 ? "tree" : "group"}>
        {childFolders.map((f) => {
          const isOpen = !collapsed.has(f.id);
          return (
            <li key={f.id} role="treeitem" aria-expanded={isOpen} aria-selected={false}>
              <div
                className={`tree-row${dragOver === f.id ? " is-over" : ""}`}
                style={{ paddingLeft: 6 + depth * 14 }}
                {...dropProps(f.id)}
                {...dragProps("folder", f.id)}
              >
                <button
                  className="tree-toggle"
                  onClick={() =>
                    setCollapsed((c) => {
                      const next = new Set(c);
                      if (next.has(f.id)) next.delete(f.id);
                      else next.add(f.id);
                      return next;
                    })
                  }
                  aria-label={isOpen ? `Collapse ${f.name}` : `Expand ${f.name}`}
                >
                  {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <Folder size={15} className="tree-folder-icon" />
                  <span>{f.name}</span>
                </button>
                {canEdit && (
                  <button className="tree-more" onClick={() => setMenu(menu === f.id ? null : f.id)} aria-label={`Actions for ${f.name}`}>
                    <MoreHorizontal size={15} />
                  </button>
                )}
                {menu === f.id && <Menu kind="folder" id={f.id} name={f.name} />}
              </div>
              {isOpen && <Branch parentId={f.id} depth={depth + 1} />}
            </li>
          );
        })}
        {childDocs.map((d) => (
          <li key={d.id} role="treeitem" aria-selected={open?.id === d.id}>
            <div className={`tree-row${open?.id === d.id ? " is-active" : ""}`} style={{ paddingLeft: 6 + depth * 14 + 16 }} {...dragProps("doc", d.id)}>
              <button className="tree-doc" onClick={() => select(d.id)}>
                {d.kind === "board" ? <PenTool size={14} /> : <FileText size={14} />}
                <span>{d.title}</span>
              </button>
              {canEdit && (
                <button className="tree-more" onClick={() => setMenu(menu === d.id ? null : d.id)} aria-label={`Actions for ${d.title}`}>
                  <MoreHorizontal size={15} />
                </button>
              )}
              {menu === d.id && <Menu kind="doc" id={d.id} name={d.title} />}
            </div>
          </li>
        ))}
        {depth === 0 && !childFolders.length && !childDocs.length && (
          <li className="muted small tree-empty">No docs yet. Create a note, whiteboard or folder above.</li>
        )}
      </ul>
    );
  }

  const trashedFolders = folders.filter((f) => f.deleted_at && !folders.some((p) => p.id === f.parent_id && p.deleted_at));
  const trashedDocs = docs.filter((d) => d.deleted_at && !folders.some((f) => f.id === d.folder_id && f.deleted_at));

  return (
    <div
      className={`docs-workspace studio${filesHidden ? " files-hidden" : ""}${mobileFiles ? " mobile-files-open" : ""}`}
    >
      <button className="btn btn-small studio-files-btn" onClick={() => setMobileFiles(true)}>
        <Folder size={14} />
        <span>Files</span>
      </button>
      {mobileFiles && <div className="sheet-backdrop studio-files-backdrop" onClick={() => setMobileFiles(false)} aria-hidden="true" />}
      {filesHidden && (
        <button
          className="btn btn-small btn-icon studio-show-files"
          onClick={() => setFilesHidden(false)}
          aria-label="Show files"
          title="Show files"
        >
          <PanelLeftOpen size={16} />
        </button>
      )}
      <aside className="docs-sidebar" aria-label="Docs and whiteboards" hidden={filesHidden}>
        <div className="studio-sidebar-top">
          {sidebarHeader}
          <button
            className="btn-plain studio-hide-files"
            onClick={() => {
              // On phones this just closes the drawer; on larger screens it frees the width.
              if (window.matchMedia("(max-width: 800px)").matches) setMobileFiles(false);
              else setFilesHidden(true);
            }}
            aria-label="Hide files"
            title="Hide files for more room"
          >
            <PanelLeftClose size={17} />
          </button>
        </div>
        {canEdit && (
          <div className="docs-actions">
            <button className="btn btn-small btn-primary" onClick={() => create("note", null)}>
              <Plus size={13} />
              <span>Note</span>
            </button>
            <button className="btn btn-small" onClick={() => create("board", null)}>
              <PenTool size={13} />
              <span>Board</span>
            </button>
            <button className="btn btn-small btn-icon" onClick={() => createFolder(null)} aria-label="New folder" title="New folder">
              <FolderPlus size={14} />
            </button>
          </div>
        )}
        <div className={`tree-root${dragOver === "root" ? " is-over" : ""}`} {...dropProps(null)}>
          {loading ? <p className="muted small">Loading…</p> : <Branch parentId={null} depth={0} />}
        </div>
        <div className="docs-sidebar-foot">
          <button className="btn btn-small" onClick={exportAll}>
            <Archive size={13} />
            <span>Export .zip</span>
          </button>
          <button className="btn btn-small" aria-pressed={showTrash} onClick={() => setShowTrash(!showTrash)}>
            <Trash2 size={13} />
            <span>Trash ({trashedFolders.length + trashedDocs.length})</span>
          </button>
        </div>
        {showTrash && (
          <ul className="trash-list">
            {trashedFolders.map((f) => (
              <li key={f.id}>
                <Folder size={13} />
                <span>{f.name}</span>
                <button className="btn-plain" onClick={() => trash("folder", f.id, true)} aria-label={`Restore ${f.name}`} title="Restore">
                  <RotateCcw size={13} />
                </button>
                <button className="btn-plain danger" onClick={() => destroy("folder", f.id)} aria-label={`Delete ${f.name} forever`} title="Delete forever">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {trashedDocs.map((d) => (
              <li key={d.id}>
                {d.kind === "board" ? <PenTool size={13} /> : <FileText size={13} />}
                <span>{d.title}</span>
                <span className="muted small">{relativeTime(d.updated_at)}</span>
                <button className="btn-plain" onClick={() => trash("doc", d.id, true)} aria-label={`Restore ${d.title}`} title="Restore">
                  <RotateCcw size={13} />
                </button>
                <button className="btn-plain danger" onClick={() => destroy("doc", d.id)} aria-label={`Delete ${d.title} forever`} title="Delete forever">
                  <Trash2 size={13} />
                </button>
              </li>
            ))}
            {!trashedFolders.length && !trashedDocs.length && <li className="muted small">Trash is empty.</li>}
          </ul>
        )}
      </aside>

      <section className="docs-content">
        {error && (
          <p className="error" role="alert">
            {error}{" "}
            <button className="btn-plain" onClick={() => setError(null)}>
              Dismiss
            </button>
          </p>
        )}
        {!openId ? (
          <div className="empty-state">
            <h2>Docs &amp; whiteboards</h2>
            <p className="muted">
              Pick a doc on the left, or create one. Notes are Markdown with live preview and [[links]] between docs; whiteboards
              are for sketching and diagrams.
            </p>
          </div>
        ) : !open || open.id !== openId ? (
          <p className="muted">Loading…</p>
        ) : open.deleted_at ? (
          <div className="empty-state">
            <p>This {open.kind === "board" ? "board" : "doc"} is in the trash.</p>
            {canEdit && (
              <button className="btn" onClick={() => trash("doc", open.id, true).then(() => loadDoc(open.id))}>
                Restore it
              </button>
            )}
          </div>
        ) : open.kind === "board" ? (
          <WhiteboardEditor
            key={`${open.id}-${openKey}`}
            doc={open}
            onRenamed={(title) => rename_(open.id, title)}
            onReload={() => loadDoc(open.id)}
            onCreateDoc={(title, content) => create("note", open.folder_id, title.slice(0, 200), content)}
          />
        ) : (
          <NoteEditor
            key={`${open.id}-${openKey}`}
            doc={open}
            titles={titles}
            onOpenLink={openByTitle}
            onRenamed={(title) => rename_(open.id, title)}
            onReload={() => loadDoc(open.id)}
          />
        )}
      </section>
    </div>
  );
}
