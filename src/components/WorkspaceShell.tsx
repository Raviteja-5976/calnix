"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  Calendar as CalendarIcon,
  FolderArchive as LibraryIcon,
  MessageSquare as ChatIcon,
  Users as TeamIcon,
  Sun,
  Moon,
  LogOut,
} from "lucide-react";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import type { Item, ItemKind, Member, Organization, Team } from "@/lib/types";
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
  memberById: (id: string | null) => Member | undefined;
  newItem: (defaults?: ItemDefaults) => void;
  editItem: (item: Item) => void;
  openItem: (id: string) => void;
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
  { href: "/library", label: "Library", icon: LibraryIcon },
  { href: "/chat", label: "Chat", icon: ChatIcon },
  { href: "/team", label: "Team", icon: TeamIcon },
];

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
  const [form, setForm] = useState<{ item?: Item; defaults?: ItemDefaults; key: number } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [unread, setUnread] = useState(0);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const currentTheme = document.documentElement.getAttribute("data-theme") as "light" | "dark" | null;
    if (currentTheme) {
      setTheme(currentTheme);
    } else {
      const stored = localStorage.getItem("calnix-theme") as "light" | "dark" | null;
      if (stored) {
        setTheme(stored);
        document.documentElement.setAttribute("data-theme", stored);
      }
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme((prev) => {
      const next = prev === "light" ? "dark" : "light";
      document.documentElement.setAttribute("data-theme", next);
      localStorage.setItem("calnix-theme", next);
      return next;
    });
  }, []);

  const newItem = useCallback((defaults?: ItemDefaults) => setForm({ defaults, key: Date.now() }), []);
  const editItem = useCallback((item: Item) => setForm({ item, key: Date.now() }), []);
  const openItem = useCallback((id: string) => setOpenId(id), []);

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
      memberById: (id) => (id ? byId.get(id) : undefined),
      newItem,
      editItem,
      openItem,
      theme,
      toggleTheme,
    };
  }, [userId, org, teams, members, newItem, editItem, openItem, theme, toggleTheme]);

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
      <div className="shell">
        <nav className="rail" aria-label="Main">
          <Link href="/calendar" className="rail-brand" aria-label="Calnix home">
            <div className="rail-logo-wrapper" title="Calnix — Less noise. More time.">
              <Image
                src="/logo.png"
                alt="Calnix Logo"
                width={32}
                height={32}
                priority
                className="rail-logo-img"
              />
            </div>
            <span className="rail-brand-name">Calnix</span>
          </Link>

          <ul>
            {NAV.map((item) => {
              const Icon = item.icon;
              const isActive = pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link href={item.href} aria-current={isActive ? "page" : undefined}>
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
          </ul>

          <div className="rail-foot">
            <button
              type="button"
              className="theme-toggle-btn"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>

            {orgs.length > 1 ? (
              <select
                aria-label="Organization"
                value={org.id}
                onChange={(e) => switchOrg(e.target.value)}
              >
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

            <button
              className="rail-signout"
              onClick={signOut}
              title="Sign out of Calnix"
              aria-label="Sign out"
            >
              <LogOut size={14} />
              <span>Sign out</span>
            </button>
          </div>
        </nav>
        <div className="workspace">{children}</div>
      </div>

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
