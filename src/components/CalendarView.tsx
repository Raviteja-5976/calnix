"use client";

import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Sparkles } from "lucide-react";
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
import type { Item } from "@/lib/types";
import { ItemCover } from "./ItemCover";
import { Avatar, useWorkspace } from "./WorkspaceShell";

type View = "month" | "week";
type ScopeFilter = "all" | "team" | "personal";

export function CalendarView() {
  const { org, teams, members, newItem } = useWorkspace();
  const now = today();
  const [view, setView] = useState<View>("month");
  const [anchor, setAnchor] = useState(now);
  const [selected, setSelected] = useState(now);
  const [scope, setScope] = useState<ScopeFilter>("all");
  const [teamId, setTeamId] = useState("all");
  const [personId, setPersonId] = useState("all");

  const weeks = useMemo(
    () => (view === "month" ? monthWeeks(anchor) : [startOfWeek(anchor)]),
    [view, anchor]
  );
  const from = weeks[0];
  const to = addDays(weeks[weeks.length - 1], 6);

  const { items, loading, error } = useItems({ orgId: org.id, from, to });

  const visible = useMemo(
    () =>
      items.filter(
        (i) =>
          (scope === "all" || i.scope === scope) &&
          (teamId === "all" || i.team_id === teamId) &&
          (personId === "all" || i.owner_id === personId || i.assignee_id === personId)
      ),
    [items, scope, teamId, personId]
  );

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
    <div className="calendar-page">
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
              className="btn btn-primary"
              onClick={() => newItem({ start_date: selected })}
              aria-label="Add new item"
            >
              <Plus size={16} />
              <span>Add</span>
            </button>
          </div>
        </header>

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

          <Legend />
        </div>

        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}

        <div className={`cal cal-${view}`} aria-busy={loading}>
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
              maxLanes={view === "month" ? 4 : 12}
              month={view === "month" ? anchor.slice(0, 7) : null}
              selected={selected}
              now={now}
              onSelect={setSelected}
            />
          ))}
        </div>
      </main>

      <DayPanel day={selected} items={itemsOnDay(visible, selected)} />
    </div>
  );
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
}: {
  week: string;
  items: Item[];
  maxLanes: number;
  month: string | null;
  selected: string;
  now: string;
  onSelect: (day: string) => void;
}) {
  const { openItem } = useWorkspace();
  const { bars, hidden } = useMemo(
    () => layoutWeek(items, week, maxLanes),
    [items, week, maxLanes]
  );
  const lanes = bars.reduce((most, b) => Math.max(most, b.lane + 1), 0);
  const days = [0, 1, 2, 3, 4, 5, 6].map((d) => addDays(week, d));

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
            {hidden[i] > 0 && <span className="day-more">+{hidden[i]}</span>}
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

function DayPanel({ day, items }: { day: string; items: Item[] }) {
  const { newItem } = useWorkspace();
  const events = items.filter((i) => i.kind === "event");
  const multiDay = items.filter((i) => i.kind === "task" && i.start_date !== i.end_date);
  const tasks = items.filter((i) => i.kind === "task" && i.start_date === i.end_date);
  const reference = items.filter((i) => i.kind === "tool" || i.kind === "prompt");

  return (
    <aside className="day-panel" aria-label={`Agenda for ${longDate(day)}`}>
      <h2>{longDate(day)}</h2>
      {!items.length && (
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
          {item.ai_description && <small className="clamp">{item.ai_description}</small>}
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
