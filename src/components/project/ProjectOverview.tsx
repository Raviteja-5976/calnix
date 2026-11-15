"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, Circle, FileText, MessageCircleQuestion, Plus, Sparkles, Trash2 } from "lucide-react";
import { runAi } from "@/lib/ai/client";
import { relativeTime, shortDate, today } from "@/lib/dates";
import { commitPlan, type DraftMilestone } from "@/lib/plan";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { progressOf } from "@/lib/use-projects";
import type { Activity, DocSummary, Milestone } from "@/lib/types";
import { AiButton } from "../AiButton";
import { keptCount, PlanDraft } from "../PlanDraft";
import { Avatar, useWorkspace } from "../WorkspaceShell";
import { useProjectData } from "./ProjectShell";

type Panel =
  | { kind: "plan"; milestones: DraftMilestone[] }
  | { kind: "replan"; summary: string; changes: { milestone_id: string; due_date: string | null; reason: string; keep: boolean }[] }
  | { kind: "answer"; answer: string; sources: { id: string; title: string }[] }
  | null;

export function ProjectOverview() {
  const { project, milestones, tasks, reload, canEdit } = useProjectData();
  const { org, aiEnabled, memberById, openItem } = useWorkspace();
  const router = useRouter();
  const [activity, setActivity] = useState<Activity[]>([]);
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [brief, setBrief] = useState("");
  const [question, setQuestion] = useState("");
  const [panel, setPanel] = useState<Panel>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newMilestone, setNewMilestone] = useState({ title: "", due: "" });
  const [allActivity, setAllActivity] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const db = supabaseBrowser();
      const [a, d] = await Promise.all([
        db.from("project_activity").select("*").eq("project_id", project.id).order("created_at", { ascending: false }).limit(25),
        db
          .from("documents")
          .select("id, team_id, project_id, folder_id, kind, title, version, deleted_at, updated_at, updated_by")
          .eq("project_id", project.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(6),
      ]);
      if (cancelled) return;
      setActivity((a.data ?? []) as Activity[]);
      setDocs((d.data ?? []) as DocSummary[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id, tasks, milestones]);

  const now = today();
  const top = tasks.filter((t) => !t.parent_id);
  const overdue = top.filter((t) => t.status !== "done" && t.start_date && t.start_date < now);
  const blocked = top.filter((t) => t.status === "blocked");
  const byMilestone = useMemo(() => {
    const map = new Map<string, ReturnType<typeof progressOf>>();
    for (const m of milestones) map.set(m.id, progressOf(tasks.filter((t) => t.milestone_id === m.id)));
    return map;
  }, [milestones, tasks]);

  async function run(name: string, action: () => Promise<void>) {
    setBusy(name);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBusy(null);
    }
  }

  const plan = () =>
    run("plan", async () => {
      const result = await runAi("plan", org.id, { projectId: project.id, brief: brief.trim() || undefined });
      setPanel({
        kind: "plan",
        milestones: result.milestones.map((m) => ({
          ...m,
          keep: true,
          tasks: m.tasks.map((t) => ({ ...t, keep: true })),
        })),
      });
    });

  const replan = () =>
    run("replan", async () => {
      const result = await runAi("replan", org.id, { projectId: project.id });
      if (!result.changes.length) {
        setNotice(result.summary || "Every open milestone looks on track.");
        return;
      }
      setPanel({ kind: "replan", summary: result.summary, changes: result.changes.map((c) => ({ ...c, keep: true })) });
    });

  const report = () =>
    run("report", async () => {
      const result = await runAi("status-report", org.id, { projectId: project.id });
      const { data, error: failure } = await supabaseBrowser()
        .from("documents")
        .insert({ team_id: project.team_id, project_id: project.id, kind: "note", title: result.title, content: result.markdown })
        .select("id")
        .single();
      if (failure || !data) throw new Error(failure?.message ?? "Could not save the report.");
      router.push(`/studio/${project.id}?doc=${data.id}`);
    });

  const ask = () =>
    run("ask", async () => {
      const result = await runAi("ask", org.id, { projectId: project.id, question });
      setPanel({ kind: "answer", ...result });
    });

  async function addMilestone(event: React.FormEvent) {
    event.preventDefault();
    if (!newMilestone.title.trim()) return;
    await run("milestone", async () => {
      const { error: failure } = await supabaseBrowser().from("milestones").insert({
        project_id: project.id,
        title: newMilestone.title.trim(),
        due_date: newMilestone.due || null,
        position: milestones.length,
      });
      if (failure) throw new Error(failure.message);
      setNewMilestone({ title: "", due: "" });
      await reload();
    });
  }

  const toggleMilestone = (m: Milestone) =>
    run("milestone", async () => {
      await supabaseBrowser().from("milestones").update({ status: m.status === "done" ? "open" : "done" }).eq("id", m.id);
      await reload();
    });

  const removeMilestone = (m: Milestone) =>
    run("milestone", async () => {
      if (!window.confirm(`Remove the milestone “${m.title}”? Its tasks stay in the project.`)) return;
      await supabaseBrowser().from("milestones").delete().eq("id", m.id);
      await reload();
    });

  return (
    <div className="overview-grid">
      <section className="card overview-stats">
        <div>
          <span className="stat">{progressOf(tasks).percent}%</span>
          <span className="muted">complete</span>
        </div>
        <div>
          <span className="stat">{top.filter((t) => t.status !== "done").length}</span>
          <span className="muted">open tasks</span>
        </div>
        <div>
          <span className={`stat${overdue.length ? " overdue" : ""}`}>{overdue.length}</span>
          <span className="muted">overdue</span>
        </div>
        <div>
          <span className={`stat${blocked.length ? " overdue" : ""}`}>{blocked.length}</span>
          <span className="muted">blocked</span>
        </div>
      </section>

      {canEdit && aiEnabled && (
        <details className="card ai-card">
          <summary>
            <span className="inline-icon">
              <Sparkles size={16} /> AI assistant
            </span>
            <span className="small muted">Plan, re-plan, report or ask</span>
          </summary>
          <p className="muted small">Nothing changes until you review and accept it.</p>
          <label className="field">
            Plan this project
            <textarea
              rows={2}
              value={brief}
              onChange={(e) => setBrief(e.target.value)}
              placeholder="Optional brief: scope, constraints, who's involved…"
              maxLength={4000}
            />
          </label>
          <div className="row-gap">
            <AiButton busy={busy === "plan"} onClick={plan} small={false}>
              Draft milestones &amp; tasks
            </AiButton>
            <AiButton busy={busy === "replan"} onClick={replan} disabled={!milestones.length}>
              Re-plan dates
            </AiButton>
            <AiButton busy={busy === "report"} onClick={report} disabled={!tasks.length}>
              Status report
            </AiButton>
          </div>
          <form
            className="inline-add"
            onSubmit={(e) => {
              e.preventDefault();
              if (question.trim().length >= 3) ask();
            }}
          >
            <MessageCircleQuestion size={16} aria-hidden="true" />
            <input value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about this project…" maxLength={1000} />
            <AiButton busy={busy === "ask"} onClick={ask} disabled={question.trim().length < 3}>
              Ask
            </AiButton>
          </form>
        </details>
      )}

      {(error || notice || panel) && (
        <section className="card overview-wide" aria-live="polite">
          {error && <p className="error">{error}</p>}
          {notice && <p className="notice">{notice}</p>}
          {panel?.kind === "plan" && (
            <>
              <h2>Draft plan</h2>
              <p className="muted small">Edit anything, untick what you don&apos;t want, then add it to the project.</p>
              <PlanDraft milestones={panel.milestones} onChange={(n) => setPanel({ kind: "plan", milestones: n.milestones ?? [] })} />
              <div className="row-gap">
                <button
                  className="btn btn-primary"
                  disabled={busy === "commit" || !keptCount(panel.milestones).milestones}
                  onClick={() =>
                    run("commit", async () => {
                      const made = await commitPlan(project, { milestones: panel.milestones }, milestones.length);
                      setPanel(null);
                      setBrief("");
                      setNotice(`Added ${made.milestones} milestones and ${made.tasks} tasks.`);
                      await reload();
                    })
                  }
                >
                  Add {keptCount(panel.milestones).milestones} milestones &amp; {keptCount(panel.milestones).tasks} tasks
                </button>
                <button className="btn" onClick={() => setPanel(null)}>
                  Discard
                </button>
              </div>
            </>
          )}
          {panel?.kind === "replan" && (
            <>
              <h2>Suggested new dates</h2>
              <p className="muted">{panel.summary}</p>
              <ul className="draft-list">
                {panel.changes.map((c, i) => {
                  const m = milestones.find((x) => x.id === c.milestone_id);
                  return (
                    <li key={c.milestone_id}>
                      <input
                        type="checkbox"
                        checked={c.keep}
                        onChange={() =>
                          setPanel({ ...panel, changes: panel.changes.map((x, j) => (j === i ? { ...x, keep: !x.keep } : x)) })
                        }
                        aria-label="Apply this change"
                      />
                      <strong>{m?.title}</strong>
                      <span className="muted small">
                        {m?.due_date ? shortDate(m.due_date) : "no date"} → {c.due_date ? shortDate(c.due_date) : "—"}
                      </span>
                      <span className="small">{c.reason}</span>
                    </li>
                  );
                })}
              </ul>
              <div className="row-gap">
                <button
                  className="btn btn-primary"
                  onClick={() =>
                    run("apply", async () => {
                      for (const c of panel.changes.filter((x) => x.keep && x.due_date)) {
                        await supabaseBrowser().from("milestones").update({ due_date: c.due_date }).eq("id", c.milestone_id);
                      }
                      setPanel(null);
                      await reload();
                    })
                  }
                >
                  Apply selected
                </button>
                <button className="btn" onClick={() => setPanel(null)}>
                  Discard
                </button>
              </div>
            </>
          )}
          {panel?.kind === "answer" && (
            <>
              <h2>Answer</h2>
              <p className="pre-wrap">{panel.answer}</p>
              {panel.sources.length > 0 && (
                <p className="small">
                  Sources:{" "}
                  {panel.sources.map((s, i) => (
                    <span key={s.id}>
                      {i > 0 && ", "}
                      <Link href={`/studio/${project.id}?doc=${s.id}`}>{s.title}</Link>
                    </span>
                  ))}
                </p>
              )}
              <button className="btn btn-small" onClick={() => setPanel(null)}>
                Close
              </button>
            </>
          )}
        </section>
      )}

      <section className="card overview-wide">
        <div className="section-head">
          <h2>Milestones</h2>
        </div>
        {milestones.length === 0 && <p className="muted">No milestones yet. Add one below, or let AI draft a plan.</p>}
        <ol className="milestone-track">
          {milestones.map((m) => {
            const p = byMilestone.get(m.id)!;
            const late = m.status !== "done" && m.due_date && m.due_date < now;
            return (
              <li key={m.id} className={`milestone-row${m.status === "done" ? " is-done" : ""}`}>
                <button
                  className="btn-plain milestone-check"
                  onClick={() => canEdit && toggleMilestone(m)}
                  aria-label={m.status === "done" ? `Reopen ${m.title}` : `Mark ${m.title} reached`}
                  disabled={!canEdit}
                >
                  {m.status === "done" ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>
                <div className="milestone-main">
                  <strong>{m.title}</strong>
                  <div className="progress progress-thin">
                    <span style={{ width: `${p.percent}%` }} />
                  </div>
                </div>
                <span className="small">
                  {p.done}/{p.total}
                </span>
                <span className={`small${late ? " overdue" : ""}`}>{m.due_date ? shortDate(m.due_date) : "No date"}</span>
                {canEdit && (
                  <button className="btn-plain" onClick={() => removeMilestone(m)} aria-label={`Remove ${m.title}`}>
                    <Trash2 size={14} />
                  </button>
                )}
              </li>
            );
          })}
        </ol>
        {canEdit && (
          <form className="inline-add" onSubmit={addMilestone}>
            <input
              value={newMilestone.title}
              onChange={(e) => setNewMilestone({ ...newMilestone, title: e.target.value })}
              placeholder="New milestone"
              maxLength={200}
            />
            <input
              type="date"
              value={newMilestone.due}
              onChange={(e) => setNewMilestone({ ...newMilestone, due: e.target.value })}
              aria-label="Due date"
            />
            <button className="btn btn-small" disabled={!newMilestone.title.trim()}>
              <Plus size={13} />
              <span>Add</span>
            </button>
          </form>
        )}
      </section>

      <section className="card">
        <h2 className="inline-icon">
          <AlertTriangle size={18} /> Needs attention
        </h2>
        {overdue.length + blocked.length === 0 ? (
          <p className="muted">Nothing overdue or blocked.</p>
        ) : (
          <ul className="task-mini-list">
            {[...blocked, ...overdue.filter((t) => t.status !== "blocked")].slice(0, 10).map((t) => (
              <li key={t.id}>
                <button className="link-button" onClick={() => openItem(t.id)}>
                  {t.title}
                </button>
                <span className={`status-pill status-${t.status}`}>{t.status === "blocked" ? "Blocked" : `Due ${shortDate(t.start_date!)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="section-head">
          <h2>Recent docs</h2>
          <Link href={`/studio/${project.id}`} className="small">
            All docs →
          </Link>
        </div>
        {docs.length === 0 ? (
          <p className="muted">No docs yet.</p>
        ) : (
          <ul className="task-mini-list">
            {docs.map((d) => (
              <li key={d.id}>
                <FileText size={14} aria-hidden="true" />
                <Link href={`/studio/${project.id}?doc=${d.id}`}>{d.title}</Link>
                <span className="muted small">{relativeTime(d.updated_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card overview-wide">
        <h2>Activity</h2>
        {activity.length === 0 ? (
          <p className="muted">No activity yet.</p>
        ) : (
          <ul className="activity-list">
            {(allActivity ? activity : activity.slice(0, 6)).map((a) => {
              const who = memberById(a.actor_id);
              return (
                <li key={a.id}>
                  <Avatar member={who} size={20} />
                  <span>
                    <strong>{who?.full_name ?? "Someone"}</strong> {a.action} <em>{a.subject}</em>
                  </span>
                  <span className="muted small">{relativeTime(a.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
        {activity.length > 6 && (
          <button className="btn btn-small" onClick={() => setAllActivity(!allActivity)}>
            {allActivity ? "Show less" : `Show all ${activity.length}`}
          </button>
        )}
      </section>
    </div>
  );
}
