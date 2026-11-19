"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AtSign, BellOff, CheckCheck, FolderKanban, MessageSquare, Users, X } from "lucide-react";
import { relativeTime } from "@/lib/dates";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import type { AppNotification, Member } from "@/lib/types";

const LIMIT = 60;

/** The signed-in person's notifications in this organization, kept live. */
export function useNotifications(orgId: string, userId: string) {
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabaseBrowser()
      .from("notifications")
      .select("id, kind, actor_id, title, body, link, count, read_at, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(LIMIT);
    setItems((data ?? []) as AppNotification[]);
    setLoaded(true);
  }, [orgId]);

  useEffect(() => {
    queueMicrotask(load);
    const unsubscribe = subscribeToTable(
      `notifications-${userId}`,
      { event: "*", table: "notifications", filter: `user_id=eq.${userId}` },
      () => load(),
    );
    // Opening a chat clears its notification in the database; catch up here.
    window.addEventListener("calnix:read", load);
    return () => {
      window.removeEventListener("calnix:read", load);
      unsubscribe();
    };
  }, [load, userId]);

  const markRead = useCallback(async (id: string) => {
    setItems((list) => list.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)));
    await supabaseBrowser().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id);
  }, []);

  const markAllRead = useCallback(async () => {
    const now = new Date().toISOString();
    setItems((list) => list.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabaseBrowser().rpc("mark_notifications_read", { p_org: orgId });
  }, [orgId]);

  const clearRead = useCallback(async () => {
    const ids = items.filter((n) => n.read_at).map((n) => n.id);
    if (!ids.length) return;
    setItems((list) => list.filter((n) => !n.read_at));
    await supabaseBrowser().from("notifications").delete().in("id", ids);
  }, [items]);

  const unread = items.filter((n) => !n.read_at).length;
  return { items, loaded, unread, markRead, markAllRead, clearRead };
}

const ICONS = { message: MessageSquare, project: FolderKanban, team: Users, mention: AtSign } as const;

export function NotificationsPanel({
  state,
  memberById,
  onOpenItem,
  onClose,
}: {
  state: ReturnType<typeof useNotifications>;
  memberById: (id: string | null) => Member | undefined;
  onOpenItem: (id: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDivElement>(null);
  const { items, loaded, unread, markRead, markAllRead, clearRead } = state;

  useEffect(() => {
    panel.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function follow(n: AppNotification) {
    if (!n.read_at) markRead(n.id);
    onClose();
    const url = new URL(n.link, window.location.origin);
    const item = url.searchParams.get("item");
    if (item) {
      url.searchParams.delete("item");
      router.push(url.pathname + url.search);
      onOpenItem(item);
      return;
    }
    router.push(n.link);
  }

  const describe = (n: AppNotification) => {
    const actor = n.actor_id ? memberById(n.actor_id)?.full_name ?? "Someone" : "Someone";
    if (n.kind === "mention") {
      return { lead: actor, action: `mentioned you in ${n.title}`, detail: n.body };
    }
    if (n.kind === "message") {
      const where = n.title === "Direct message" ? "sent you a message" : `in ${n.title}`;
      return {
        lead: actor,
        action: n.count > 1 ? `${where} · ${n.count} new` : where,
        detail: n.body,
      };
    }
    return { lead: actor, action: n.body ?? "", detail: n.title };
  };

  return (
    <>
      <div className="notif-backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={panel}
        className="notif-panel"
        role="dialog"
        aria-label="Notifications"
        tabIndex={-1}
      >
        <header className="notif-head">
          <h2>Notifications</h2>
          <div className="notif-head-actions">
            <button
              type="button"
              className="btn-plain"
              onClick={markAllRead}
              disabled={!unread}
              title="Mark all as read"
            >
              <CheckCheck size={15} />
              <span>Mark all read</span>
            </button>
            <button type="button" className="btn-plain" onClick={onClose} aria-label="Close notifications">
              <X size={16} />
            </button>
          </div>
        </header>
        {!loaded ? (
          <p className="muted small notif-empty">Loading…</p>
        ) : items.length === 0 ? (
          <div className="notif-empty">
            <BellOff size={22} aria-hidden="true" />
            <p className="muted small">
              You&apos;re all caught up. Messages, project updates and team changes will show up here.
            </p>
          </div>
        ) : (
          <ul className="notif-list">
            {items.map((n) => {
              const Icon = ICONS[n.kind];
              const text = describe(n);
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    className={`notif-row${n.read_at ? "" : " is-unread"}`}
                    onClick={() => follow(n)}
                  >
                    <span className={`notif-icon notif-${n.kind}`} aria-hidden="true">
                      <Icon size={15} />
                    </span>
                    <span className="notif-text">
                      <span className="notif-line">
                        <strong>{text.lead}</strong> {text.action}
                      </span>
                      {text.detail && <span className="notif-detail">{text.detail}</span>}
                      <time dateTime={n.created_at}>{relativeTime(n.created_at)}</time>
                    </span>
                    {!n.read_at && <span className="notif-dot" aria-label="Unread" />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {items.some((n) => n.read_at) && (
          <footer className="notif-foot">
            <button type="button" className="btn-plain" onClick={clearRead}>
              Clear read notifications
            </button>
          </footer>
        )}
      </div>
    </>
  );
}
