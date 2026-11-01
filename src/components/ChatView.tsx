"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { ArrowLeft, Hash, Plus, Send, Users } from "lucide-react";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import type { ConversationSummary, Message } from "@/lib/types";
import { Avatar, useWorkspace } from "./WorkspaceShell";

const PAGE = 200;

export function ChatView() {
  const { org, userId, members, memberById } = useWorkspace();
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // One draft per conversation, so text never follows you into another chat.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const draft = activeId ? drafts[activeId] ?? "" : "";
  const setDraft = (id: string, text: string) =>
    setDrafts((all) => ({ ...all, [id]: text }));
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const activeRef = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const others = members.filter((m) => m.id !== userId);

  const loadConversations = useCallback(async () => {
    const { data } = await supabaseBrowser().rpc("conversation_overview", {
      p_org: org.id,
    });
    const list = (data ?? []) as ConversationSummary[];
    setConversations(list);
    return list;
  }, [org.id]);

  const markRead = useCallback(async (id: string) => {
    await supabaseBrowser().rpc("mark_conversation_read", { p_conversation: id });
    window.dispatchEvent(new Event("calnix:read"));
    setConversations((list) =>
      list.map((c) => (c.id === id ? { ...c, unread: 0 } : c))
    );
  }, []);

  const open = useCallback(
    async (id: string) => {
      activeRef.current = id;
      setActiveId(id);
      setMessages([]); // Never show one conversation's messages under another's name.
      setError(null);
      const { data } = await supabaseBrowser()
        .from("messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: false })
        .limit(PAGE);
      if (activeRef.current !== id) return;
      setMessages(((data ?? []) as Message[]).reverse());
      markRead(id);
    },
    [markRead]
  );

  useEffect(() => {
    queueMicrotask(async () => {
      const list = await loadConversations();
      if (
        list[0] &&
        !activeRef.current &&
        window.matchMedia("(min-width: 800px)").matches
      )
        open(list[0].id);
    });
    return subscribeToTable(
      `chat-${org.id}`,
      { event: "INSERT", table: "messages" },
      async (row) => {
        const message = row as unknown as Message;
        if (message.conversation_id === activeRef.current) {
          setMessages((list) =>
            list.some((m) => m.id === message.id) ? list : [...list, message]
          );
          // Mark it read before reloading, or the list would show it as unread.
          await markRead(message.conversation_id);
        }
        loadConversations();
      }
    );
  }, [org.id, loadConversations, markRead, open]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const body = draft.trim();
    const target = activeId;
    if (!body || !target) return;
    setDraft(target, "");
    const { data, error: failure } = await supabaseBrowser()
      .from("messages")
      .insert({ conversation_id: target, body })
      .select("*")
      .single();
    if (failure) {
      setDraft(target, body);
      setError("Your message wasn't sent. Try again.");
      return;
    }
    setError(null);
    if (activeRef.current === target) {
      setMessages((list) =>
        list.some((m) => m.id === data.id) ? list : [...list, data as Message]
      );
    }
    loadConversations();
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  async function startDm(user: string) {
    activeRef.current = null;
    setActiveId(null);
    const { data, error: failure } = await supabaseBrowser().rpc("start_dm", {
      p_org: org.id,
      p_user: user,
    });
    if (failure) {
      setError(failure.message);
      return;
    }
    await loadConversations();
    open(data as string);
  }

  const nameOf = (c: ConversationSummary) =>
    c.kind === "dm"
      ? memberById(c.other_user_id)?.full_name ?? "Former member"
      : c.name ?? "Group";

  const active = conversations.find((c) => c.id === activeId);
  const teamChats = conversations.filter((c) => c.kind === "team");
  const groups = conversations.filter((c) => c.kind === "group");
  const dms = conversations.filter((c) => c.kind === "dm");
  const dmPartners = new Set(dms.map((c) => c.other_user_id));
  const newPeople = others.filter((m) => !dmPartners.has(m.id));

  const list = (title: string, items: ConversationSummary[]) =>
    items.length > 0 && (
      <section>
        <h2>{title}</h2>
        <ul>
          {items.map((c) => (
            <li key={c.id}>
              <button
                className="conv"
                aria-current={c.id === activeId ? "true" : undefined}
                onClick={() => open(c.id)}
              >
                {c.kind === "dm" ? (
                  <Avatar member={memberById(c.other_user_id)} size={28} />
                ) : (
                  <span className="conv-glyph" aria-hidden="true">
                    #
                  </span>
                )}
                <span className="conv-text">
                  <strong>{nameOf(c)}</strong>
                  <small>{c.last_body ?? "No messages yet"}</small>
                </span>
                {c.unread > 0 && (
                  <em className="badge" aria-label={`${c.unread} unread`}>
                    {c.unread}
                  </em>
                )}
              </button>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div className="chat" data-open={Boolean(activeId)}>
      <aside className="chat-list">
        <header className="chat-list-head">
          <h1>Chat</h1>
          <button className="btn btn-small" onClick={() => setStarting(true)}>
            <Plus size={14} />
            <span>New group</span>
          </button>
        </header>
        {list("Team chats", teamChats)}
        {list("Groups", groups)}
        {list("Direct messages", dms)}
        {newPeople.length > 0 && (
          <section>
            <h2>Message someone</h2>
            <ul>
              {newPeople.map((m) => (
                <li key={m.id}>
                  <button className="conv" onClick={() => startDm(m.id)}>
                    <Avatar member={m} size={28} />
                    <span className="conv-text">
                      <strong>{m.full_name}</strong>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </aside>

      <main className="thread">
        {active ? (
          <>
            <header className="thread-head">
              <button
                className="btn-plain chat-back"
                onClick={() => {
                  activeRef.current = null;
                  setActiveId(null);
                }}
                aria-label="Back to chat list"
              >
                <ArrowLeft size={16} />
                <span>Back</span>
              </button>
              <h2>{nameOf(active)}</h2>
              {active.kind === "dm" && (
                <p className="muted">Direct message · End-to-end team privacy</p>
              )}
            </header>
            <ol className="messages" aria-live="polite">
              {messages.map((message, index) => {
                const sender = memberById(message.sender_id);
                const mine = message.sender_id === userId;
                const first = messages[index - 1]?.sender_id !== message.sender_id;
                return (
                  <li
                    key={message.id}
                    className={mine ? "msg msg-mine" : "msg"}
                    data-first={first}
                  >
                    {!mine &&
                      (first ? (
                        <Avatar member={sender} size={28} />
                      ) : (
                        <span className="msg-gap" />
                      ))}
                    <div>
                      {!mine && first && active.kind !== "dm" && (
                        <p className="msg-name">
                          {sender?.full_name ?? "Former member"}
                        </p>
                      )}
                      <p className="bubble">{message.body}</p>
                      <time dateTime={message.created_at}>
                        {new Date(message.created_at).toLocaleTimeString([], {
                          hour: "numeric",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  </li>
                );
              })}
              <div ref={bottom} />
            </ol>
            {error && (
              <p className="error thread-error" role="alert">
                {error}
              </p>
            )}
            <form className="composer" onSubmit={send}>
              <textarea
                rows={1}
                value={draft}
                maxLength={4000}
                aria-label={`Message ${nameOf(active)}`}
                placeholder={`Message ${nameOf(active)}... (Press Enter to send)`}
                onChange={(e) => setDraft(active.id, e.target.value)}
                onKeyDown={onKeyDown}
              />
              <button
                className="btn btn-primary"
                disabled={!draft.trim()}
                title="Send message"
              >
                <Send size={15} />
                <span>Send</span>
              </button>
            </form>
          </>
        ) : (
          <p className="muted empty thread-empty">
            {conversations.length || others.length
              ? "Select a conversation to start messaging."
              : "Invite a teammate from the Team page to start chatting."}
          </p>
        )}
      </main>

      {starting && (
        <NewGroupDialog
          onClose={() => setStarting(false)}
          onCreated={async (id) => {
            setStarting(false);
            activeRef.current = null;
            setActiveId(null);
            await loadConversations();
            open(id);
          }}
        />
      )}
    </div>
  );
}

function NewGroupDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const { org, members, userId } = useWorkspace();
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const picked = form.getAll("member").map(String);
    if (!picked.length) {
      setError("Pick at least one person.");
      return;
    }
    const { data, error: failure } = await supabaseBrowser().rpc("create_group", {
      p_org: org.id,
      p_name: String(form.get("name")),
      p_members: picked,
    });
    if (failure) setError(failure.message);
    else onCreated(data as string);
  }

  return (
    <dialog ref={dialog} className="modal" onClose={onClose} aria-labelledby="group-title">
      <form onSubmit={submit} className="stack">
        <header className="modal-head">
          <h2 id="group-title">New group</h2>
          <button
            type="button"
            className="btn-plain"
            onClick={() => dialog.current?.close()}
          >
            Close
          </button>
        </header>
        <label className="field">
          Group name
          <input name="name" required maxLength={80} autoFocus />
        </label>
        <fieldset className="field">
          <legend>People</legend>
          <div className="people-list">
            {members
              .filter((m) => m.id !== userId)
              .map((m) => (
                <label className="check" key={m.id}>
                  <input type="checkbox" name="member" value={m.id} />
                  <Avatar member={m} size={22} /> {m.full_name}
                </label>
              ))}
          </div>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <footer className="modal-foot">
          <button className="btn btn-primary">Create group</button>
        </footer>
      </form>
    </dialog>
  );
}
