"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, SlidersHorizontal, X } from "lucide-react";
import { itemsOnDay, layoutWeek } from "@/lib/calendar-layout";
import {
  addDays,
  addMonths,
  daysBetween,
  formatTime,
  longDate,
  monthName,
  monthWeeks,
  shortDate,
  startOfWeek,
  today,
  weekdayShort,
  year,
} from "@/lib/dates";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { announceItemsChanged, useItems } from "@/lib/use-items";
import type { Item, Milestone } from "@/lib/types";
import { ItemCover } from "./ItemCover";
import { Avatar, useWorkspace } from "./WorkspaceShell";

type View = "month" | "week";
type ScopeFilter = "all" | "team" | "personal";

export function CalendarView() {
  const { org, teams, members, newItem, projects } = useWorkspace();
  const now = today();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(now);
  const [selected, setSelected] = useState(now);
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [teamId, setTeamId] = useState("all");
  const [personId, setPersonId] = useState("all");
  const [projectId, setProjectId] = useState("all");
  const [showFilters, setShowFilters] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // The month grid fits the screen; the number of bars per week follows its real height.
  const grid = useRef<HTMLDivElement>(null);
  const [gridHeight, setGridHeight] = useState(0);

  useEffect(() => {
    const el = grid.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => setGridHeight(entry.contentRect.height));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const [milestones, setMilestones] = useState<Milestone[]>([]);

  const weeks = useMemo(
    () => (view === "month" ? monthWeeks(anchor) : [startOfWeek(anchor)]),
    [view, anchor]
  );
  const from = weeks[0];
  const to = addDays(weeks[weeks.length - 1], 6);

  const { items, loading, error } = useItems({ orgId: org.id, from, to });

  // Milestone due dates in view, shown as diamonds on their day.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabaseBrowser()
        .from("milestones")
        .select("*")
        .eq("org_id", org.id)
        .gte("due_date", from)
        .lte("due_date", to);
      if (!cancelled) setMilestones((data ?? []) as Milestone[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [org.id, from, to]);

  const visibleMilestones = useMemo(
    () =>
      milestones.filter(
        (m) => (projectId === "all" || m.project_id === projectId) && (teamId === "all" || m.team_id === teamId),
      ),
    [milestones, projectId, teamId],
  );

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (scope === "all" || i.scope === scope) &&
          (teamId === "all" || i.team_id === teamId) &&
          (personId === "all" || i.owner_id === personId || i.assignee_id === personId) &&
          (projectId === "all" || (projectId === "none" ? !i.project_id : i.project_id === projectId))
      ),
    [items, scope, teamId, personId, projectId]
  );

  const activeFilters =
    Number(scope !== "all") + Number(teamId !== "all") + Number(personId !== "all") + Number(projectId !== "all");

  function selectDay(day: string) {
    setSelected(day);
    setPanelOpen(true);
  }

  function move(direction: 1 | -1) {
    const next = view === "month" ? addMonths(anchor, direction) : addDays(anchor, direction * 7);
    setAnchor(next);
    setSelected(next);
  }

  function goToday() {
    setAnchor(now);
    setSelected(now);
  }

  const title =
    view === "month" || anchor.slice(0, 7) === addDays(startOfWeek(anchor), 6).slice(0, 7)
      ? monthName(anchor)
      : `${monthName(startOfWeek(anchor))} / ${monthName(addDays(startOfWeek(anchor), 6))}`;

  return (
    <div className={`calendar-page${panelOpen ? "" : " panel-closed"}`}>
      <main className="calendar-main">
        <header className="cal-head">
          <h1 className="month-title">
            {title} <span>{year(anchor)}</span>
          </h1>
          <div className="cal-controls">
            <div className="btn-group">
              <button
                className="btn"
                onClick={() => move(-1)}
                aria-label={`Previous ${view}`}
                title={`Previous ${view}`}
              >
                <ChevronLeft size={16} />
              </button>
              <button className="btn" onClick={goToday}>
                Today
              </button>
              <button
                className="btn"
                onClick={() => move(1)}
                aria-label={`Next ${view}`}
                title={`Next ${view}`}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div className="btn-group" role="group" aria-label="View">
              <button
                className="btn"
                aria-pressed={view === "month"}
                onClick={() => setView("month")}
              >
                Month
              </button>
              <button
                className="btn"
                aria-pressed={view === "week"}
                onClick={() => {
                  setAnchor(selected);
                  setView("week");
                }}
              >
                Week
              </button>
            </div>

            <button
              className="btn"
              aria-pressed={showFilters || activeFilters > 0}
              aria-expanded={showFilters}
              onClick={() => setShowFilters(!showFilters)}
            >
              <SlidersHorizontal size={15} />
              <span>Filters{activeFilters ? ` · ${activeFilters}` : ""}</span>
            </button>

            <button
              className="btn btn-primary"
              onClick={() => newItem({ start_date: selected })}
              aria-label="Add new item"
            >
              <Plus size={16} />
              <span>Add</span>
            </button>
          </div>
        </header>

        {showFilters && (
        <div className="cal-filters">
          <div className="btn-group" role="group" aria-label="Show">
            {(["all", "team", "personal"] as const).map((s) => (
              <button
                key={s}
                className="btn btn-small"
                aria-pressed={scope === s}
                onClick={() => setScope(s)}
              >
                {s === "all" ? "Everything" : s === "team" ? "Team" : "Personal"}
              </button>
            ))}
          </div>

          {teams.length > 1 && (
            <select
              aria-label="Filter by team"
              value={teamId}
              onChange={(e) => setTeamId(e.target.value)}
            >
              <option value="all">All teams</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}

          <select
            aria-label="Filter by person"
            value={personId}
            onChange={(e) => setPersonId(e.target.value)}
          >
            <option value="all">Everyone</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.full_name}
              </option>
            ))}
          </select>

          {projects.length > 0 && (
            <select aria-label="Filter by project" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
              <option value="all">All projects</option>
              <option value="none">Not in a project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}

          {activeFilters > 0 && (
            <button
              className="btn btn-small btn-plain"
              onClick={() => {
                setScope("all");
                setTeamId("all");
                setPersonId("all");
                setProjectId("all");
              }}
            >
              Clear filters
            </button>
          )}
          <Legend />
        </div>
        )}

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div ref={grid} className={`cal cal-${view}`} aria-busy={loading}>
          <div className="cal-weekdays" aria-hidden="true">
            {[0, 1, 2, 3, 4, 5, 6].map((d) => (
              <span key={d}>{weekdayShort(addDays(weeks[0], d))}</span>
            ))}
          </div>
          {weeks.map((week) => (
            <Week
              key={week}
              week={week}
              items={visible}
              maxLanes={view === "month" ? monthLanes(gridHeight, weeks.length) : 12}
              month={view === "month" ? anchor.slice(0, 7) : null}
              selected={selected}
              now={now}
              onSelect={selectDay}
              milestones={visibleMilestones}
            />
          ))}
        </div>
      </main>

      {panelOpen && <div className="day-panel-backdrop" onClick={() => setPanelOpen(false)} aria-hidden="true" />}
      {panelOpen && (
      <DayPanel
        onClose={() => setPanelOpen(false)}
        day={selected}
        items={itemsOnDay(visible, selected)}
        milestones={visibleMilestones.filter((m) => m.due_date === selected)}
      />
      )}
    </div>
  );
}

/** Bars that fit in one week row: day number on top, then 26px per bar. */
function monthLanes(gridHeight: number, weeks: number) {
  if (!gridHeight) return 3;
  const perWeek = (gridHeight - 34) / weeks;
  return Math.max(1, Math.min(5, Math.floor((perWeek - 36) / 26)));
}

function Legend() {
  return (
    <ul className="legend" aria-label="Key">
      <li>
        <i className="swatch band-task" /> Task
      </li>
      <li>
        <i className="swatch band-event" /> Event
      </li>
      <li>
        <i className="swatch band-tool" /> Tool
      </li>
      <li>
        <i className="swatch band-prompt" /> Prompt
      </li>
      <li>
        <i className="swatch band-task band-hatch" /> Stripes mean personal
      </li>
      <li>
        <i className="diamond" /> Milestone
      </li>
    </ul>
  );
}

function Week({
  week,
  items,
  maxLanes,
  month,
  selected,
  now,
  onSelect,
  milestones,
}: {
  week: string;
  items: Item[];
  maxLanes: number;
  month: string | null;
  selected: string;
  now: string;
  onSelect: (day: string) => void;
  milestones: Milestone[];
}) {
  const { openItem } = useWorkspace();
  const { bars, hidden } = useMemo(
    () => layoutWeek(items, week, maxLanes),
    [items, week, maxLanes]
  );
  const lanes = bars.reduce((most, b) => Math.max(most, b.lane + 1), 0);
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(week, d));
  const dotsByDay = useMemo(
    () => days.map((day) => itemsOnDay(items, day).map((item) => item.kind)),
    // days is derived from week.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [items, week],
  );

  return (
    <div
      className="week"
      style={
        {
          "--lanes": month ? maxLanes : Math.max(lanes, 6),
        } as React.CSSProperties
      }
    >
      <div className="week-days">
        {days.map((day, i) => (
          <button
            key={day}
            className="day"
            data-outside={month !== null && day.slice(0, 7) !== month}
            data-selected={day === selected}
            data-today={day === now}
            onClick={() => onSelect(day)}
            aria-label={`${longDate(day)}${hidden[i] ? `, ${hidden[i]} more` : ""}`}
            aria-pressed={day === selected}
          >
            <span className="day-num">{Number(day.slice(8))}</span>
            {milestones.some((m) => m.due_date === day) && (
              <span
                className="diamond day-milestone"
                title={milestones
                  .filter((m) => m.due_date === day)
                  .map((m) => `Milestone: ${m.title}`)
                  .join(", ")}
              />
            )}
            {hidden[i] > 0 && <span className="day-more">+{hidden[i]}</span>}
            <span className="day-dots" aria-hidden="true">
              {dotsByDay[i].slice(0, 3).map((kind, n) => (
                <i key={n} className={`dot dot-${kind}`} />
              ))}
              {dotsByDay[i].length > 3 && <b>+</b>}
            </span>
          </button>
        ))}
      </div>
      <div className="week-bars">
        {bars.map(({ item, column, span, lane, continuesBefore, continuesAfter }) => (
          <button
            key={item.id}
            className={`band band-${item.kind} ${
              item.scope === "personal" ? "band-hatch" : ""
            } ${item.status === "done" ? "band-done" : ""}`}
            data-cont-before={continuesBefore}
            data-cont-after={continuesAfter}
            style={{ gridColumn: `${column + 1} / span ${span}`, gridRow: lane + 1 }}
            onClick={() => openItem(item.id)}
            title={`${item.title} (${item.kind})`}
          >
            <span>
              {item.start_time && item.start_date === item.end_date
                ? `${formatTime(item.start_time)} `
                : ""}
              {item.title}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function DayPanel({
  day,
  items,
  milestones,
  onClose,
}: {
  day: string;
  items: Item[];
  milestones: Milestone[];
  onClose: () => void;
}) {
  const { newItem, projects } = useWorkspace();
  const events = items.filter((i) => i.kind === "event");
  const multiDay = items.filter((i) => i.kind === "task" && i.start_date !== i.end_date);
  const tasks = items.filter((i) => i.kind === "task" && i.start_date === i.end_date);
  const reference = items.filter((i) => i.kind === "tool" || i.kind === "prompt");

  return (
    <aside className="day-panel" aria-label={`Agenda for ${longDate(day)}`}>
      <div className="day-panel-head">
        <h2>{longDate(day)}</h2>
        <button className="btn-plain" onClick={onClose} aria-label="Close day details">
          <X size={18} />
        </button>
      </div>
      {milestones.length > 0 && (
        <section className="day-section">
          <h3>Milestones</h3>
          <ul className="task-mini-list">
            {milestones.map((m) => (
              <li key={m.id}>
                <i className={`diamond${m.status === "done" ? " is-done" : ""}`} aria-hidden="true" />
                <Link href={`/projects/${m.project_id}`}>{m.title}</Link>
                <span className="muted small">{projects.find((p) => p.id === m.project_id)?.name}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!items.length && !milestones.length && (
        <div className="day-empty">
          <p className="muted">Nothing scheduled for this day yet.</p>
          <button className="btn btn-small" onClick={() => newItem({ start_date: day })}>
            <Plus size={14} />
            <span>Add to this day</span>
          </button>
        </div>
      )}
      <Section title="Events" items={events} day={day} />
      <Section title="Tasks today" items={tasks} day={day} />
      <Section title="Running over several days" items={multiDay} day={day} />
      <Section title="Tools and prompts" items={reference} day={day} />
    </aside>
  );
}

function Section({ title, items, day }: { title: string; items: Item[]; day: string }) {
  if (!items.length) return null;
  return (
    <section className="day-section">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <Row key={item.id} item={item} day={day} />
        ))}
      </ul>
    </section>
  );
}

function Row({ item, day }: { item: Item; day: string }) {
  const { openItem, memberById, userId, isAdmin, me } = useWorkspace();
  const owner = memberById(item.assignee_id ?? item.owner_id);
  const canEdit =
    isAdmin ||
    (me.teamIds.includes(item.team_id) && (item.scope === "team" || item.owner_id === userId));

  // Optimistic status update with instant visual feedback
  const [optimistic, setOptimistic] = useState<{
    from: Item["status"];
    to: Item["status"];
  } | null>(null);
  const [failed, setFailed] = useState(false);
  const status = optimistic?.from === item.status ? optimistic.to : item.status;

  async function toggle() {
    const next = status === "done" ? "todo" : "done";
    setFailed(false);
    setOptimistic({ from: item.status, to: next });
    const { error } = await supabaseBrowser()
      .from("items")
      .update({ status: next })
      .eq("id", item.id);
    if (error) {
      setOptimistic(null);
      setFailed(true);
      return;
    }
    announceItemsChanged();
  }

  const spanning = item.start_date !== item.end_date;
  const position = spanning
    ? `Day ${daysBetween(item.start_date!, day) + 1} of ${
        daysBetween(item.start_date!, item.end_date!) + 1
      }, until ${shortDate(item.end_date!)}`
    : item.start_time
    ? `${formatTime(item.start_time)}${item.end_time ? ` to ${formatTime(item.end_time)}` : ""}`
    : null;

  return (
    <li className={`agenda-row ${status === "done" ? "is-done" : ""}`}>
      {item.kind === "task" && (
        <input
          type="checkbox"
          checked={status === "done"}
          disabled={!canEdit}
          onChange={toggle}
          aria-label={`${item.title} is done`}
        />
      )}
      <button className="agenda-open" onClick={() => openItem(item.id)}>
        <ItemCover item={item} className="thumb" />
        <span className="agenda-text">
          <strong>{item.title}</strong>
          {position && <small>{position}</small>}
          {item.summary && <small className="clamp">{item.summary}</small>}
          {item.scope === "personal" && <small className="personal-note">Personal</small>}
          {failed && (
            <small className="error" role="alert">
              Could not save. Try again.
            </small>
          )}
        </span>
        <Avatar member={owner} size={24} />
      </button>
    </li>
  );
}
