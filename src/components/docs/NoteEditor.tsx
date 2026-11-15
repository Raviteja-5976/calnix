"use client";

import { useEffect, useRef, useState } from "react";
import {
  Bold,
  CheckSquare,
  Code,
  Download,
  Heading2,
  History,
  ImagePlus,
  Italic,
  Link as LinkIcon,
  Link2,
  List,
  Quote,
  Sparkles,
} from "lucide-react";
import { runAi } from "@/lib/ai/client";
import { compressImage } from "@/lib/compress-image";
import { commitPlan, type DraftMilestone, type DraftTask } from "@/lib/plan";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useAutosave } from "@/lib/use-autosave";
import type { Doc, DocSummary, Project } from "@/lib/types";
import { download, safeFilename } from "@/lib/zip";
import { AiButton } from "../AiButton";
import { keptCount, PlanDraft } from "../PlanDraft";
import { useWorkspace } from "../WorkspaceShell";
import { MarkdownEditor, type MarkdownEditorHandle } from "./MarkdownEditor";
import { VersionHistory } from "./VersionHistory";
import { SaveBadge } from "./SaveBadge";

type EditAction = "rewrite" | "shorten" | "expand" | "fix" | "translate" | "continue" | "tldr";

const TEMPLATES = [
  { id: "meeting-notes", label: "Meeting notes" },
  { id: "spec", label: "Spec / PRD" },
  { id: "decision", label: "Decision record" },
  { id: "runbook", label: "Runbook" },
  { id: "retro", label: "Retrospective" },
  { id: "brief", label: "Brief" },
];

type Panel =
  | { kind: "edit"; action: EditAction; text: string; from: number; to: number }
  | { kind: "tasks"; tasks: DraftTask[]; projectId: string }
  | { kind: "plan"; milestones: DraftMilestone[] }
  | { kind: "links"; links: { title: string; reason: string }[] }
  | null;

export function NoteEditor({
  doc,
  titles,
  onOpenLink,
  onRenamed,
  onReload,
}: {
  doc: Doc;
  titles: string[];
  onOpenLink: (title: string) => void;
  onRenamed: (title: string) => void;
  onReload: () => void;
}) {
  const { org, aiEnabled, projects } = useWorkspace();
  const editor = useRef<MarkdownEditorHandle | null>(null);
  const content = useRef(doc.content);
  const save = useAutosave(doc.id, doc.version);
  const [title, setTitle] = useState(doc.title);
  const [empty, setEmpty] = useState(!doc.content.trim());
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState(false);
  const [aiMenu, setAiMenu] = useState(false);
  const [template, setTemplate] = useState("meeting-notes");
  const [brief, setBrief] = useState("");
  const [backlinks, setBacklinks] = useState<DocSummary[]>([]);
  const [taskProject, setTaskProject] = useState(doc.project_id ?? "");

  const teamProjects = projects.filter((p) => p.team_id === doc.team_id);

  // Docs that link here with [[this title]].
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const escaped = doc.title.replace(/[%_\\]/g, (c) => `\\${c}`);
      const db = supabaseBrowser();
      const columns = "id, team_id, project_id, folder_id, kind, title, version, deleted_at, updated_at, updated_by";
      const [plain, aliased] = await Promise.all([
        db.from("documents").select(columns).eq("team_id", doc.team_id).is("deleted_at", null).neq("id", doc.id).ilike("content", `%[[${escaped}]]%`).limit(30),
        db.from("documents").select(columns).eq("team_id", doc.team_id).is("deleted_at", null).neq("id", doc.id).ilike("content", `%[[${escaped}|%`).limit(30),
      ]);
      if (cancelled) return;
      const byId = new Map([...(plain.data ?? []), ...(aliased.data ?? [])].map((d) => [d.id, d as DocSummary]));
      setBacklinks([...byId.values()]);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc.id, doc.team_id, doc.title]);

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setAiMenu(false);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const uploadImage = async (file: File) => {
    const blob = await compressImage(file);
    const form = new FormData();
    form.append("file", blob, "image.webp");
    const response = await fetch(`/api/docs/${doc.id}/files`, { method: "POST", body: form });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error ?? "Upload failed");
    return body.url as string;
  };

  const edit = (action: EditAction) =>
    run(action, async () => {
      const sel = editor.current?.selection();
      if (!sel) return;
      const whole = action === "tldr" || (!sel.text.trim() && action !== "continue");
      const text = action === "continue" ? sel.before || content.current : whole ? content.current : sel.text;
      if (!text.trim()) throw new Error("Write or select some text first.");
      const language =
        action === "translate" ? (window.prompt("Translate into which language?", "Spanish") ?? "").trim() : undefined;
      if (action === "translate" && !language) return;
      const result = await runAi("doc-edit", org.id, { action, text: text.slice(-30000), language });
      setPanel({
        kind: "edit",
        action,
        text: result.text,
        from: action === "tldr" ? 0 : action === "continue" ? sel.to : whole ? 0 : sel.from,
        to: action === "tldr" ? 0 : action === "continue" ? sel.to : whole ? content.current.length : sel.to,
      });
    });

  function applyEdit(mode: "replace" | "below") {
    if (panel?.kind !== "edit" || !editor.current) return;
    const { action, text, from, to } = panel;
    if (action === "tldr") editor.current.replace(0, 0, `> **TL;DR**\n${text.split("\n").map((l) => `> ${l}`).join("\n")}\n\n`);
    else if (action === "continue") editor.current.replace(from, from, `${from > 0 ? "\n\n" : ""}${text}`);
    else if (mode === "replace") editor.current.replace(from, to, text);
    else editor.current.replace(to, to, `\n\n${text}`);
    setPanel(null);
  }

  const fillTemplate = () =>
    run("template", async () => {
      const result = await runAi("template", org.id, { template, brief, projectId: doc.project_id ?? undefined });
      editor.current?.replace(0, content.current.length, result.markdown);
      if (title === "Untitled" || !title.trim()) changeTitle(result.title);
      setBrief("");
    });

  const actionItems = () =>
    run("tasks", async () => {
      await save.flush();
      const result = await runAi("action-items", org.id, { documentId: doc.id });
      if (!result.tasks.length) throw new Error("No action items found in this doc.");
      setPanel({ kind: "tasks", tasks: result.tasks.map((t) => ({ ...t, keep: true })), projectId: taskProject || teamProjects[0]?.id || "" });
    });

  const planFromDoc = () =>
    run("plan", async () => {
      await save.flush();
      const result = await runAi("plan", org.id, { projectId: doc.project_id, documentId: doc.id });
      setPanel({
        kind: "plan",
        milestones: result.milestones.map((m) => ({ ...m, keep: true, tasks: m.tasks.map((t) => ({ ...t, keep: true })) })),
      });
    });

  const suggestLinks = () =>
    run("links", async () => {
      await save.flush();
      const result = await runAi("suggest-links", org.id, { documentId: doc.id });
      if (!result.links.length) throw new Error("No related docs found yet.");
      setPanel({ kind: "links", links: result.links });
    });

  function changeTitle(next: string) {
    setTitle(next);
    const clean = next.trim();
    if (clean) {
      save.queue({ title: clean.slice(0, 200) });
      onRenamed(clean);
    }
  }

  const targetProject = (id: string): Project | undefined => projects.find((p) => p.id === id);

  return (
    <div className="doc-layout">
      <article className="doc-main">
        <header className="doc-head">
          <input
            className="doc-title"
            value={title}
            onChange={(e) => changeTitle(e.target.value)}
            maxLength={200}
            aria-label="Document title"
          />
          <SaveBadge state={save.state} error={save.error} />
        </header>

        {save.state === "conflict" && (
          <div className="notice conflict" role="alert">
            <span>A teammate saved this doc after you opened it. Your latest edits are not saved yet.</span>
            <button className="btn btn-small" onClick={onReload}>
              Load their version
            </button>
            <button className="btn btn-small btn-danger" onClick={save.overwrite}>
              Keep mine (overwrite)
            </button>
          </div>
        )}

        <div className="doc-toolbar" role="toolbar" aria-label="Formatting">
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.prefixLines("## ")} aria-label="Heading" title="Heading">
            <Heading2 size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.wrap("**")} aria-label="Bold" title="Bold (Ctrl+B)">
            <Bold size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.wrap("*")} aria-label="Italic" title="Italic">
            <Italic size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.prefixLines("- ")} aria-label="Bulleted list" title="List">
            <List size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.prefixLines("- [ ] ")} aria-label="Task list" title="Task">
            <CheckSquare size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.prefixLines("> ")} aria-label="Quote" title="Quote">
            <Quote size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.wrap("`")} aria-label="Code" title="Code">
            <Code size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.wrap("[", "](https://)")} aria-label="Link" title="Link">
            <LinkIcon size={15} />
          </button>
          <button className="btn btn-small btn-icon" onClick={() => editor.current?.wrap("[[", "]]")} aria-label="Link a doc" title="Link a doc ([[ ]])">
            <Link2 size={15} />
          </button>
          <label className="btn btn-small btn-icon" title="Insert image (shrunk under 250 KB)" aria-label="Insert image">
            <ImagePlus size={15} />
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (!file) return;
                run("image", async () => editor.current?.insert(`![](${await uploadImage(file)})\n`));
              }}
            />
          </label>
          <span className="spacer" />
          {aiEnabled && (
            <div className="menu-wrap">
              <button className="btn btn-small btn-ai" onClick={() => setAiMenu(!aiMenu)} aria-expanded={aiMenu}>
                <Sparkles size={13} />
                <span>{busy ? "Working…" : "AI"}</span>
              </button>
              {aiMenu && (
                <div className="menu" role="menu">
                  <p className="menu-label">Selected text (or whole doc)</p>
                  {(
                    [
                      ["rewrite", "Rewrite"],
                      ["shorten", "Shorten"],
                      ["expand", "Expand"],
                      ["fix", "Fix spelling & grammar"],
                      ["translate", "Translate…"],
                    ] as [EditAction, string][]
                  ).map(([action, label]) => (
                    <button key={action} role="menuitem" onClick={() => edit(action)}>
                      {label}
                    </button>
                  ))}
                  <p className="menu-label">Document</p>
                  <button role="menuitem" onClick={() => edit("continue")}>
                    Continue writing at cursor
                  </button>
                  <button role="menuitem" onClick={() => edit("tldr")}>
                    Add a TL;DR at the top
                  </button>
                  <button role="menuitem" onClick={suggestLinks}>
                    Suggest [[links]]
                  </button>
                  <button role="menuitem" onClick={actionItems}>
                    Turn action items into tasks
                  </button>
                  {doc.project_id && (
                    <button role="menuitem" onClick={planFromDoc}>
                      Turn this doc into a project plan
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
          <button className="btn btn-small" onClick={() => setHistory(!history)} aria-pressed={history}>
            <History size={13} />
            <span>History</span>
          </button>
          <button
            className="btn btn-small"
            onClick={() => download(new Blob([content.current], { type: "text/markdown" }), `${safeFilename(title)}.md`)}
          >
            <Download size={13} />
            <span>.md</span>
          </button>
        </div>

        {empty && aiEnabled && (
          <div className="card template-card">
            <p className="small">
              <strong>Start from a template.</strong> AI fills it in from a one-line brief.
            </p>
            <div className="inline-add">
              <select value={template} onChange={(e) => setTemplate(e.target.value)} aria-label="Template">
                {TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
              <input value={brief} onChange={(e) => setBrief(e.target.value)} placeholder="e.g. Kickoff for the spring course launch" maxLength={2000} />
              <AiButton busy={busy === "template"} disabled={brief.trim().length < 3} onClick={fillTemplate}>
                Draft it
              </AiButton>
            </div>
          </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        {panel && (
          <section className="card ai-result" aria-live="polite">
            {panel.kind === "edit" && (
              <>
                <h3>AI suggestion</h3>
                <textarea value={panel.text} onChange={(e) => setPanel({ ...panel, text: e.target.value })} rows={8} />
                <div className="row-gap">
                  {panel.action !== "tldr" && panel.action !== "continue" && (
                    <button className="btn btn-primary btn-small" onClick={() => applyEdit("replace")}>
                      Replace
                    </button>
                  )}
                  <button className="btn btn-small" onClick={() => applyEdit("below")}>
                    {panel.action === "tldr" ? "Add at top" : panel.action === "continue" ? "Insert" : "Insert below"}
                  </button>
                  <button className="btn btn-small" onClick={() => setPanel(null)}>
                    Discard
                  </button>
                </div>
              </>
            )}
            {panel.kind === "tasks" && (
              <>
                <h3>Action items</h3>
                <PlanDraft tasks={panel.tasks} onChange={(n) => setPanel({ ...panel, tasks: n.tasks ?? [] })} />
                <div className="row-gap">
                  <select
                    value={panel.projectId}
                    onChange={(e) => {
                      setPanel({ ...panel, projectId: e.target.value });
                      setTaskProject(e.target.value);
                    }}
                    aria-label="Add to project"
                  >
                    <option value="">Choose a project…</option>
                    {teamProjects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className="btn btn-primary btn-small"
                    disabled={!panel.projectId || !keptCount(undefined, panel.tasks).tasks}
                    onClick={() =>
                      run("commit", async () => {
                        const project = targetProject(panel.projectId);
                        if (!project) throw new Error("Choose a project.");
                        const made = await commitPlan(project, { tasks: panel.tasks });
                        setPanel(null);
                        setError(null);
                        window.alert(`Added ${made.tasks} tasks to ${project.name}.`);
                      })
                    }
                  >
                    Add {keptCount(undefined, panel.tasks).tasks} tasks
                  </button>
                  <button className="btn btn-small" onClick={() => setPanel(null)}>
                    Discard
                  </button>
                </div>
                {!teamProjects.length && <p className="hint">Create a project on this team first to add tasks to it.</p>}
              </>
            )}
            {panel.kind === "plan" && (
              <>
                <h3>Plan from this doc</h3>
                <PlanDraft milestones={panel.milestones} onChange={(n) => setPanel({ kind: "plan", milestones: n.milestones ?? [] })} />
                <div className="row-gap">
                  <button
                    className="btn btn-primary btn-small"
                    onClick={() =>
                      run("commit", async () => {
                        const project = targetProject(doc.project_id!);
                        if (!project) throw new Error("Project not found.");
                        const { count } = await supabaseBrowser()
                          .from("milestones")
                          .select("id", { count: "exact", head: true })
                          .eq("project_id", project.id);
                        const made = await commitPlan(project, { milestones: panel.milestones }, count ?? 0);
                        setPanel(null);
                        window.alert(`Added ${made.milestones} milestones and ${made.tasks} tasks to ${project.name}.`);
                      })
                    }
                  >
                    Add to project
                  </button>
                  <button className="btn btn-small" onClick={() => setPanel(null)}>
                    Discard
                  </button>
                </div>
              </>
            )}
            {panel.kind === "links" && (
              <>
                <h3>Related docs</h3>
                <ul className="task-mini-list">
                  {panel.links.map((l) => (
                    <li key={l.title}>
                      <button className="btn btn-small" onClick={() => editor.current?.insert(`[[${l.title}]]`)}>
                        Insert [[{l.title}]]
                      </button>
                      <span className="muted small">{l.reason}</span>
                    </li>
                  ))}
                </ul>
                <button className="btn btn-small" onClick={() => setPanel(null)}>
                  Close
                </button>
              </>
            )}
          </section>
        )}

        <MarkdownEditor
          initial={doc.content}
          titles={titles}
          editorRef={editor}
          onOpenLink={onOpenLink}
          onUploadImage={uploadImage}
          onChange={(text) => {
            content.current = text;
            setEmpty(!text.trim());
            save.queue({ content: text });
          }}
        />

        <footer className="backlinks">
          <h3>Linked from</h3>
          {backlinks.length === 0 ? (
            <p className="muted small">No docs link here yet. Link this doc from another with [[{title}]].</p>
          ) : (
            <ul className="label-row">
              {backlinks.map((b) => (
                <li key={b.id}>
                  <button className="label-chip" onClick={() => onOpenLink(b.title)}>
                    {b.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </footer>
      </article>

      {history && <VersionHistory docId={doc.id} isBoard={false} onRestored={onReload} onClose={() => setHistory(false)} />}
    </div>
  );
}
