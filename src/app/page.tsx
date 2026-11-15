import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, CalendarDays, FileText, FolderKanban, Sparkles } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "DTA-Cal — Plan it. Track it. Ship it." };

const DAYS = [
  ["Mon", 3],
  ["Tue", 4],
  ["Wed", 5],
  ["Thu", 6],
  ["Fri", 7],
  ["Sat", 8],
  ["Sun", 9],
] as const;
const TODAY = 3; // index into DAYS: Thursday

// col/span place each band on the week grid; row is its lane under the day headers.
const BANDS = [
  { kind: "task", title: "Write course outline", col: 1, span: 3, row: 2 },
  { kind: "event", title: "Sprint review", col: 4, span: 2, row: 2, hatch: true },
  { kind: "prompt", title: "Record module 1", col: 2, span: 4, row: 3 },
  { kind: "tool", title: "API spec", col: 6, span: 2, row: 3 },
  { kind: "task", title: "Beta launch", col: 3, span: 3, row: 4, hatch: true },
  { kind: "event", title: "Team retro", col: 1, span: 2, row: 5 },
  { kind: "tool", title: "Signup flow board", col: 4, span: 4, row: 5 },
];

const FEATURES = [
  {
    icon: FolderKanban,
    tone: "task",
    title: "Projects that ship",
    body: "Every project gets a goal, milestones and tasks, with board, list and timeline views and live progress.",
  },
  {
    icon: CalendarDays,
    tone: "event",
    title: "One team calendar",
    body: "Tasks, events and milestones for you and your team, laid out across the week.",
  },
  {
    icon: FileText,
    tone: "tool",
    title: "Docs & whiteboards",
    body: "Markdown notes with [[links]] and backlinks, plus whiteboards, in nested folders inside each project.",
  },
  {
    icon: Sparkles,
    tone: "prompt",
    title: "AI when you ask",
    body: "Draft a project plan, break down a milestone, write a doc or sketch a diagram. Nothing runs until you click.",
  },
] as const;

const MARQUEE = [
  ["task", "Milestone: Beta ready"],
  ["event", "Client kickoff"],
  ["tool", "API spec.md"],
  ["prompt", "Plan this project ✨"],
  ["task", "Fix release blockers"],
  ["event", "1:1 with Maya"],
  ["tool", "Signup flow board"],
  ["prompt", "Break down milestone ✨"],
] as const;

const vars = (v: Record<string, string | number>) => v as CSSProperties;

export default async function Home() {
  const supabase = await supabaseServer();
  const { data } = await supabase.auth.getUser();
  const signedIn = Boolean(data.user);

  const primary = signedIn
    ? { href: "/calendar", label: "Open your calendar" }
    : { href: "/signup", label: "Get started free" };

  return (
    <main className="home">
      <nav className="home-nav">
        <Link href="/" className="home-brand">
          <Image src="/logo.png" alt="" width={34} height={34} priority />
          DTA-Cal
        </Link>
        <div className="home-nav-links">
          {signedIn ? (
            <Link href="/calendar" className="btn btn-primary">
              <span>Open DTA-Cal</span>
              <ArrowRight size={15} />
            </Link>
          ) : (
            <>
              <Link href="/login" className="btn btn-plain">
                Sign in
              </Link>
              <Link href="/signup" className="btn btn-primary">
                <span>Get started</span>
                <ArrowRight size={15} />
              </Link>
            </>
          )}
        </div>
      </nav>

      <section className="home-hero">
        <div>
          <p className="home-eyebrow">
            <span className="home-eyebrow-dot" aria-hidden="true" />
            PROJECTS · CALENDAR · DOCS · WHITEBOARDS
          </p>
          <h1 className="home-title">
            {["Plan", "it."].map((w, i) => (
              <span key={w} className="word" style={vars({ "--i": i })}>
                {w}{" "}
              </span>
            ))}
            <br />
            {["Track", "it."].map((w, i) => (
              <span key={w + i} className="word" style={vars({ "--i": i + 2 })}>
                {w}{" "}
              </span>
            ))}
            <br />
            <span className="word accent" style={vars({ "--i": 4 })}>
              Ship it.
            </span>
          </h1>
          <p className="home-lede">
            DTA-Cal is your team&apos;s project manager, calendar, docs and whiteboards in one place, with AI
            that drafts plans and docs only when you ask.
          </p>
          <div className="home-ctas">
            <Link href={primary.href} className="btn btn-primary btn-lg">
              <span>{primary.label}</span>
              <ArrowRight size={16} />
            </Link>
            {!signedIn && (
              <Link href="/login" className="btn btn-lg">
                I already have an account
              </Link>
            )}
          </div>
        </div>

        <div className="home-board-wrap" aria-hidden="true">
          <div className="home-board">
            <div className="home-board-head">
              <span>Course launch</span>
              <span className="home-mono">DESIGN TEAM</span>
            </div>
            <div className="home-week">
              <span className="home-today-col" style={vars({ "--col": TODAY + 1 })} />
              {DAYS.map(([day, date], i) => (
                <span
                  key={day}
                  className={`home-day${i === TODAY ? " is-today" : ""}`}
                  style={vars({ "--col": i + 1 })}
                >
                  {day}
                  <b>{date}</b>
                </span>
              ))}
              {BANDS.map((b, i) => (
                <span
                  key={b.title}
                  className={`band band-${b.kind}${b.hatch ? " band-hatch" : ""}`}
                  style={vars({ "--col": b.col, "--span": b.span, "--row": b.row, "--i": i })}
                >
                  <span>{b.title}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="home-chip home-chip-ai">
            <Sparkles size={14} />
            Plan drafted · 4 milestones
          </div>
          <div className="home-chip home-chip-team">
            <span className="home-avatars">
              <i style={{ background: "#2B4BDB" }} />
              <i style={{ background: "#C2256E" }} />
              <i style={{ background: "#0F7B6C" }} />
            </span>
            3 teammates here
          </div>
        </div>
      </section>

      <section className="home-features" aria-label="What DTA-Cal does">
        {FEATURES.map(({ icon: Icon, tone, title, body }) => (
          <article key={title} className={`home-feature home-reveal tone-${tone}`}>
            <span className="home-feature-icon">
              <Icon size={20} />
            </span>
            <h2>{title}</h2>
            <p className="muted">{body}</p>
          </article>
        ))}
      </section>

      <section className="home-closing">
        <div className="home-marquee" aria-hidden="true">
          <div className="home-marquee-track">
            {[...MARQUEE, ...MARQUEE].map(([kind, label], i) => (
              <span key={i} className={`band band-${kind}`}>
                <span>{label}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="home-closing-body home-reveal">
          <h2>Stop juggling tools. Start shipping.</h2>
          <Link href={primary.href} className="btn btn-lg home-closing-btn">
            <span>{primary.label}</span>
            <ArrowRight size={16} />
          </Link>
        </div>
        <footer className="home-footer">
          <span>© {new Date().getFullYear()} DTA-Cal</span>
          <span>Plan it. Track it. Ship it.</span>
        </footer>
      </section>
    </main>
  );
}
