import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";
import { ArrowRight, CalendarDays, Library, MessagesSquare, Sparkles } from "lucide-react";
import { supabaseServer } from "@/lib/supabase/server";

export const metadata = { title: "Calnix — Less noise. More time." };

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
  { kind: "task", title: "Sprint planning · Q4 roadmap", col: 1, span: 3, row: 2 },
  { kind: "event", title: "Design review", col: 4, span: 2, row: 2, hatch: true },
  { kind: "prompt", title: "Release notes prompt", col: 2, span: 4, row: 3 },
  { kind: "tool", title: "Figma tokens", col: 6, span: 2, row: 3 },
  { kind: "task", title: "Ship v2.0", col: 3, span: 3, row: 4, hatch: true },
  { kind: "event", title: "Team retro", col: 1, span: 2, row: 5 },
  { kind: "tool", title: "Analytics dashboard", col: 4, span: 4, row: 5 },
];

const FEATURES = [
  {
    icon: CalendarDays,
    tone: "task",
    title: "One calendar",
    body: "Tasks and events for you and your team, laid out as bands across the week.",
  },
  {
    icon: Library,
    tone: "tool",
    title: "A shared library",
    body: "Keep the tools and prompts your team reaches for next to the work that uses them.",
  },
  {
    icon: Sparkles,
    tone: "prompt",
    title: "Written for you",
    body: "Every entry gets a short description and a cover illustration, generated automatically.",
  },
  {
    icon: MessagesSquare,
    tone: "event",
    title: "Team chat",
    body: "Talk it through in team channels and direct messages without leaving your plan.",
  },
] as const;

const MARQUEE = [
  ["task", "Quarterly planning"],
  ["event", "Client kickoff"],
  ["tool", "Linear"],
  ["prompt", "Summarise this PR"],
  ["task", "Design QA"],
  ["event", "1:1 with Maya"],
  ["tool", "Figma"],
  ["prompt", "Write a launch email"],
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
          Calnix
        </Link>
        <div className="home-nav-links">
          {signedIn ? (
            <Link href="/calendar" className="btn btn-primary">
              <span>Open Calnix</span>
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
            CALENDAR · LIBRARY · TEAM CHAT
          </p>
          <h1 className="home-title">
            {["Less", "noise."].map((w, i) => (
              <span key={w} className="word" style={vars({ "--i": i })}>
                {w}{" "}
              </span>
            ))}
            <br />
            <span className="word" style={vars({ "--i": 2 })}>
              More{" "}
            </span>
            <span className="word accent" style={vars({ "--i": 3 })}>
              time.
            </span>
          </h1>
          <p className="home-lede">
            Calnix keeps your team&apos;s calendar, tasks, tools and prompts in one calm place, so you
            spend less time looking for things and more time doing them.
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
              <span>This week</span>
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
            Cover image ready
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

      <section className="home-features" aria-label="What Calnix does">
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
          <h2>Give your team its week back.</h2>
          <Link href={primary.href} className="btn btn-lg home-closing-btn">
            <span>{primary.label}</span>
            <ArrowRight size={16} />
          </Link>
        </div>
        <footer className="home-footer">
          <span>© {new Date().getFullYear()} Calnix</span>
          <span>Less noise. More time.</span>
        </footer>
      </section>
    </main>
  );
}
