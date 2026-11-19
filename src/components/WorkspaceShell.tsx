"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  Calendar as CalendarIcon,
  FolderArchive as LibraryIcon,
  FolderKanban as ProjectsIcon,
  ListTodo as TasksIcon,
  MessageSquare as ChatIcon,
  Users as TeamIcon,
  UserRound as ProfileIcon,
  Search,
  MoreHorizontal,
  X,
  Sun,
  Moon,
  LogOut,
  Bell,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import { useProjects } from "@/lib/use-projects";
import type { Item, ItemKind, Member, Organization, Project, Team } from "@/lib/types";
import { CommandPalette } from "./CommandPalette";
import { NotificationsPanel, useNotifications } from "./Notifications";
import { ItemDrawer } from "./ItemDrawer";
import { ItemForm, type ItemDefaults } from "./ItemForm";

interface Workspace {
  userId: string;
  org: Organization;
  teams: Team[];
  members: Member[];
  me: Member;
  isAdmin: boolean;
  /** Teams this person can add items to. */
  writableTeams: Team[];
  /** Active projects in this organization. */
  projects: Project[];
  aiEnabled: boolean;
  memberById: (id: string | null) => Member | undefined;
  newItem: (defaults?: ItemDefaults) => void;
  editItem: (item: Item) => void;
  openItem: (id: string) => void;
  openSearch: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
}

const WorkspaceContext = createContext<Workspace | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("useWorkspace must be used inside WorkspaceShell");
  return value;
}

const NAV = [
  { href: "/calendar", label: "Calendar", icon: CalendarIcon },
  { href: "/projects", label: "Projects", icon: ProjectsIcon },
  { href: "/tasks", label: "My tasks", icon: TasksIcon },
  { href: "/chat", label: "Chat", icon: ChatIcon },
  // On phones these move into the "More" sheet so the bottom bar stays readable.
  { href: "/library", label: "Library", icon: LibraryIcon, secondary: true },
  { href: "/team", label: "Team", icon: TeamIcon, secondary: true },
  { href: "/profile", label: "Profile", icon: ProfileIcon, secondary: true },
];

const THEME_KEY = "calnix-theme";

function subscribeTheme(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}
const readTheme = () =>
  document.documentElement.getAttribute("data-theme") === "dark" ? ("dark" as const) : ("light" as const);

// Desktop sidebar: full width or icons only, remembered in this browser.
const RAIL_KEY = "calnix-rail";
let railMemory: boolean | null = null; // Used when storage is blocked.
function subscribeRail(onChange: () => void) {
  window.addEventListener("calnix:rail", onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener("calnix:rail", onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readRail() {
  if (railMemory !== null) return railMemory;
  try {
    return localStorage.getItem(RAIL_KEY) === "collapsed";
  } catch {
    return false;
  }
}

export function WorkspaceShell(props: {
  userId: string;
  org: Organization;
  orgs: Organization[];
  teams: Team[];
  members: Member[];
  children: React.ReactNode;
}) {
  const { userId, org, orgs, teams, members, children } = props;
  const pathname = usePathname();
  const router = useRouter();
  // The docs studio takes the whole window: no main navigation beside it.
  const focus = pathname.startsWith("/studio");
  const [form, setForm] = useState<{ item?: Item; defaults?: ItemDefaults; key: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const { projects } = useProjects(org.id);
  // The theme lives on <html>, set before paint by the script in the root layout.
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => "light" as const);
  const railCollapsed = useSyncExternalStore(subscribeRail, readRail, () => false);
  const notifications = useNotifications(org.id, userId);
  const [notifOpen, setNotifOpen] = useState(false);
  const closeNotifications = useCallback(() => setNotifOpen(false), []);

  const toggleRail = useCallback(() => {
    const next = !readRail();
    railMemory = next;
    try {
      localStorage.setItem(RAIL_KEY, next ? "collapsed" : "open");
      railMemory = null;
    } catch {
      // Private mode: the choice lasts for this page only.
    }
    window.dispatchEvent(new Event("calnix:rail"));
  }, []);

  const toggleTheme = useCallback(() => {
    const next = readTheme() === "light" ? "dark" : "light";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode: the choice lasts for this page only.
    }
  }, []);

  const newItem = useCallback((defaults?: ItemDefaults) => setForm({ defaults, key: Date.now() }), []);
  const editItem = useCallback((item: Item) => setForm({ item, key: Date.now() }), []);
  const openItem = useCallback((id: string) => setOpenId(id), []);
  const openSearch = useCallback(() => setSearching(true), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearching((open) => !open);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const value = useMemo<Workspace>(() => {
    const byId = new Map(members.map((m) => [m.id, m]));
    const me = byId.get(userId)!;
    const isAdmin = me.role !== "member";
    return {
      userId,
      org,
      teams,
      members,
      me,
      isAdmin,
      writableTeams: isAdmin ? teams : teams.filter((t) => me.teamIds.includes(t.id)),
      projects,
      aiEnabled: org.ai_enabled,
      memberById: (id) => (id ? byId.get(id) : undefined),
      newItem,
      editItem,
      openItem,
      openSearch,
      theme,
      toggleTheme,
    };
  }, [userId, org, teams, members, projects, newItem, editItem, openItem, openSearch, theme, toggleTheme]);

  useEffect(() => {
    const refresh = async () => {
      const { data } = await supabaseBrowser().rpc("conversation_overview", { p_org: org.id });
      setUnread(((data ?? []) as { unread: number }[]).reduce((sum, c) => sum + c.unread, 0));
    };
    queueMicrotask(refresh);
    const unsubscribe = subscribeToTable(`unread-${org.id}`, { event: "INSERT", table: "messages" }, () => refresh());
    window.addEventListener("calnix:read", refresh);
    return () => {
      window.removeEventListener("calnix:read", refresh);
      unsubscribe();
    };
  }, [org.id]);

  function switchOrg(id: string) {
    document.cookie = `calnix-org=${id}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  async function signOut() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <WorkspaceContext.Provider value={value}>
      <div className={`shell${focus ? " shell-focus" : ""}${railCollapsed && !focus ? " rail-collapsed" : ""}`}>
        {!focus && (
        <nav className="rail" aria-label="Main">
          <Link href="/calendar" className="rail-brand" aria-label="DTA-Cal home">
            <div className="rail-logo-wrapper">
              <Image src="/logo.png" alt="" width={30} height={30} priority className="rail-logo-img" />
            </div>
            <span className="rail-brand-name">DTA-Cal</span>
          </Link>

          <button type="button" className="rail-search" onClick={openSearch} title="Search (Ctrl K)">
            <Search size={16} aria-hidden="true" />
            <span>Search</span>
            <kbd>Ctrl K</kbd>
          </button>

          <ul>
            <li className="rail-secondary">
              {/* An <a> so it shares the nav item styles at every screen size. */}
              <a
                href="#notifications"
                role="button"
                className="rail-bell"
                aria-expanded={notifOpen}
                aria-label={
                  notifications.unread ? `Notifications, ${notifications.unread} unread` : "Notifications"
                }
                title="Notifications"
                onClick={(e) => {
                  e.preventDefault();
                  setNotifOpen((open) => !open);
                }}
                onKeyDown={(e) => {
                  if (e.key === " ") {
                    e.preventDefault();
                    setNotifOpen((open) => !open);
                  }
                }}
              >
                <Bell aria-hidden="true" />
                <span>Notifications</span>
                {notifications.unread > 0 && (
                  <em className="badge" aria-hidden="true">
                    {notifications.unread > 99 ? "99+" : notifications.unread}
                  </em>
                )}
              </a>
            </li>
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href} className={item.secondary ? "rail-secondary" : undefined}>
                  <Link href={item.href} aria-current={isActive ? "page" : undefined} title={item.label}>
                    <Icon aria-hidden="true" />
                    <span>{item.label}</span>
                    {item.href === "/chat" && unread > 0 && (
                      <em className="badge" aria-label={`${unread} unread`}>
                        {unread > 99 ? "99+" : unread}
                      </em>
                    )}
                  </Link>
                </li>
              );
            })}
            <li className="rail-more-item">
              <button
                type="button"
                className="rail-more"
                aria-expanded={moreOpen}
                aria-current={NAV.some((n) => n.secondary && pathname.startsWith(n.href)) ? "page" : undefined}
                onClick={() => setMoreOpen(!moreOpen)}
              >
                <MoreHorizontal aria-hidden="true" />
                <span>More</span>
                {notifications.unread > 0 && <i className="rail-more-dot" aria-label="New notifications" />}
              </button>
            </li>
          </ul>

          <div className="rail-foot">
            <div className="rail-foot-row">
              <button
                type="button"
                className="theme-toggle-btn"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
                title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              >
                {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button
                type="button"
                className="theme-toggle-btn rail-collapse"
                onClick={toggleRail}
                aria-label={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
                aria-pressed={railCollapsed}
                title={railCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              >
                {railCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
              </button>
            </div>

            {orgs.length > 1 ? (
              <select aria-label="Organization" value={org.id} onChange={(e) => switchOrg(e.target.value)}>
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rail-org" title={org.name}>
                {org.name}
              </p>
            )}

            <button className="rail-signout" onClick={signOut} aria-label="Sign out">
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
        )}
        <div className="workspace">{children}</div>
        {notifOpen && !focus && (
          <NotificationsPanel
            state={notifications}
            memberById={value.memberById}
            onOpenItem={openItem}
            onClose={closeNotifications}
          />
        )}
      </div>

      {moreOpen && !focus && (
        <>
          <div className="sheet-backdrop" onClick={() => setMoreOpen(false)} aria-hidden="true" />
          <div className="more-sheet" role="dialog" aria-label="More">
            <div className="more-sheet-head">
              <strong>{org.name}</strong>
              <button className="btn-plain" onClick={() => setMoreOpen(false)} aria-label="Close">
                <X size={18} />
              </button>
            </div>
            <button
              className="more-row"
              onClick={() => {
                setMoreOpen(false);
                openSearch();
              }}
            >
              <Search size={18} aria-hidden="true" />
              Search
            </button>
            <button
              className="more-row"
              onClick={() => {
                setMoreOpen(false);
                setNotifOpen(true);
              }}
            >
              <Bell size={18} aria-hidden="true" />
              Notifications
              {notifications.unread > 0 && <em className="badge more-badge">{notifications.unread}</em>}
            </button>
            {NAV.filter((n) => n.secondary).map((item) => {
              const Icon = item.icon;
              return (
                <Link key={item.href} href={item.href} className="more-row" onClick={() => setMoreOpen(false)}>
                  <Icon size={18} aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            <button className="more-row" onClick={toggleTheme}>
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
              {theme === "light" ? "Dark mode" : "Light mode"}
            </button>
            {orgs.length > 1 && (
              <label className="more-row">
                Organization
                <select value={org.id} onChange={(e) => switchOrg(e.target.value)}>
                  {orgs.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <button className="more-row danger" onClick={signOut}>
              <LogOut size={18} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </>
      )}

      {form && (
        <ItemForm
          key={form.key}
          item={form.item}
          defaults={form.defaults}
          onClose={() => setForm(null)}
          onSaved={(id) => {
            setForm(null);
            setOpenId(id);
          }}
        />
      )}
      {openId && <ItemDrawer key={openId} id={openId} onClose={() => setOpenId(null)} />}
      {searching && <CommandPalette onClose={() => setSearching(false)} />}
    </WorkspaceContext.Provider>
  );
}

export function Avatar({ member, size = 26 }: { member?: Member; size?: number }) {
  const initials = (member?.full_name ?? "?")
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <span
      className="avatar"
      title={member?.full_name}
      style={{
        background: member?.color ?? "#5A6880",
        width: size,
        height: size,
        fontSize: size * 0.42,
      }}
    >
      {initials}
    </span>
  );
}

export const kindClass = (kind: ItemKind) => `band-${kind}`;
