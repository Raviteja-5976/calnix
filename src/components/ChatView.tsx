"use client";

/* eslint-disable @next/next/no-img-element -- chat images come from signed, short-lived links */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { ArrowLeft, Download, FileText, Paperclip, Plus, Send, X } from "lucide-react";
import { subscribeToTable, supabaseBrowser } from "@/lib/supabase/browser";
import { fileKind, formatBytes, MAX_FILE_BYTES, MAX_FILES, uploadChatFile } from "@/lib/chat-upload";
import { compressImage, MAX_UPLOAD_BYTES } from "@/lib/compress-image";
import { encodeMentions, mentionQuery, parseMentions, type Mention } from "@/lib/mentions";
import type { Attachment, ConversationSummary, Message } from "@/lib/types";
import { MentionList, useMentionSearch, type MentionOption } from "./MentionPicker";
import { Avatar, useWorkspace } from "./WorkspaceShell";

const PAGE = 200;

interface PendingFile {
  id: string;
  file: File;
  /** Object URL for a local preview of pictures and videos. */
  preview: string | null;
  /** Pictures are shrunk below 250 KB before sending; this is the size before. */
  originalSize?: number;
  compressing?: boolean;
}

/**
 * Pictures we shrink before sending, like WhatsApp. GIFs keep their animation
 * and SVGs stay sharp, so those (and anything already small) go as they are.
 */
const shouldCompress = (file: File) =>
  /^image\/(jpeg|png|webp|bmp|avif|heic|heif)$/.test(file.type) && file.size > MAX_UPLOAD_BYTES;

let pendingSeq = 0;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** WhatsApp-style day headings: Today, Yesterday, a weekday this week, else the date. */
function dayLabel(iso: string, now = new Date()) {
  const date = new Date(iso);
  const days = Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString([], { weekday: "long" });
  return date.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

export function ChatView() {
  const { org, userId, members, memberById, projects, openItem } = useWorkspace();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const wanted = params.get("c");
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  // One draft (text and files) per conversation, so nothing follows you into another chat.
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [files, setFiles] = useState<Record<string, PendingFile[]>>({});
  const draft = activeId ? drafts[activeId] ?? "" : "";
  const pending = activeId ? files[activeId] ?? [] : [];
  const setDraft = (id: string, text: string) =>
    setDrafts((all) => ({ ...all, [id]: text }));
  const [error, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [sending, setSending] = useState<{ id: string; percent: number } | null>(null);
  const [dropping, setDropping] = useState(false);
  // Mentions picked per conversation, turned into tokens when the message is sent.
  const [picked, setPicked] = useState<Record<string, Mention[]>>({});
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);
  const [mentionIndex, setMentionIndex] = useState(0);
  const [participants, setParticipants] = useState<string[]>([]);
  const activeRef = useRef<string | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
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
      setMention(null);
      setParticipants([]);
      const db = supabaseBrowser();
      const [{ data }, { data: people }] = await Promise.all([
        db
          .from("messages")
          .select("*")
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .limit(PAGE),
        db.from("conversation_members").select("user_id").eq("conversation_id", id),
      ]);
      if (activeRef.current !== id) return;
      setMessages(((data ?? []) as Message[]).reverse());
      setParticipants(((people ?? []) as { user_id: string }[]).map((p) => p.user_id));
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
        !new URLSearchParams(window.location.search).has("c") &&
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

  // A notification links here with ?c=<conversation>: open it, then tidy the URL
  // so the same link works again later.
  useEffect(() => {
    if (!wanted) return;
    queueMicrotask(() => {
      if (activeRef.current !== wanted) open(wanted);
      router.replace(pathname, { scroll: false });
    });
  }, [wanted, open, router, pathname]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages]);

  function addFiles(target: string, list: FileList | File[]) {
    const incoming = Array.from(list);
    if (!incoming.length) return;
    const tooBig = incoming.filter((f) => f.size > MAX_FILE_BYTES);
    const fitting = incoming.filter((f) => f.size <= MAX_FILE_BYTES && f.size > 0);
    const current = files[target] ?? [];
    const room = Math.max(0, MAX_FILES - current.length);
    const accepted = fitting.slice(0, room).map<PendingFile>((file) => ({
      id: `f${++pendingSeq}`,
      file,
      preview: /^(image|video)\//.test(file.type) ? URL.createObjectURL(file) : null,
      compressing: shouldCompress(file),
    }));
    setFiles((all) => ({ ...all, [target]: [...(all[target] ?? []), ...accepted] }));
    for (const pending of accepted) if (pending.compressing) shrink(target, pending);
    if (tooBig.length) setError(`${tooBig.map((f) => f.name).join(", ")}: files must be 50 MB or smaller.`);
    else if (fitting.length > room) setError(`You can send up to ${MAX_FILES} files in one message.`);
    else setError(null);
  }

  /** Swaps a picture for its under-250 KB WebP copy once it's ready. */
  async function shrink(target: string, pending: PendingFile) {
    let replacement: Partial<PendingFile> = { compressing: false };
    try {
      const blob = await compressImage(pending.file);
      const ext = blob.type === "image/webp" ? "webp" : blob.type.split("/")[1] ?? "img";
      const name = pending.file.name.replace(/\.[^.]+$/, "") + `.${ext}`;
      replacement = {
        compressing: false,
        file: new File([blob], name, { type: blob.type }),
        originalSize: pending.file.size,
      };
    } catch {
      // Unreadable here (e.g. HEIC in some browsers): send the original instead.
    }
    setFiles((all) => ({
      ...all,
      [target]: (all[target] ?? []).map((p) => (p.id === pending.id ? { ...p, ...replacement } : p)),
    }));
  }

  function removeFile(target: string, id: string) {
    setFiles((all) => {
      const gone = (all[target] ?? []).find((p) => p.id === id);
      if (gone?.preview) URL.revokeObjectURL(gone.preview);
      return { ...all, [target]: (all[target] ?? []).filter((p) => p.id !== id) };
    });
  }

  function clearFiles(target: string) {
    setFiles((all) => {
      (all[target] ?? []).forEach((p) => p.preview && URL.revokeObjectURL(p.preview));
      return { ...all, [target]: [] };
    });
  }

  function showSent(target: string, message: Message) {
    if (activeRef.current === target) {
      setMessages((list) =>
        list.some((m) => m.id === message.id) ? list : [...list, message]
      );
    }
    loadConversations();
  }

  async function sendFiles(target: string, body: string, queue: PendingFile[]) {
    const total = queue.reduce((sum, p) => sum + p.file.size, 0) || 1;
    const sent = new Map<string, number>();
    setSending({ id: target, percent: 0 });
    try {
      const uploaded = await Promise.all(
        queue.map((p) =>
          uploadChatFile(target, p.file, (bytes) => {
            sent.set(p.id, bytes);
            const done = [...sent.values()].reduce((a, b) => a + b, 0);
            setSending({ id: target, percent: Math.min(99, Math.round((done / total) * 100)) });
          })
        )
      );
      const response = await fetch(`/api/chat/${target}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, attachments: uploaded }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error ?? "Your message wasn't sent.");
      setDraft(target, "");
      setPicked((all) => ({ ...all, [target]: [] }));
      clearFiles(target);
      setError(null);
      showSent(target, data as Message);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Your files weren't sent. Try again.");
    } finally {
      setSending(null);
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const target = activeId;
    if (!target || sending) return;
    const typed = draft;
    const mentions = picked[target] ?? [];
    const body = encodeMentions(typed, mentions).trim();
    setMention(null);
    const queue = files[target] ?? [];
    if (queue.length) return sendFiles(target, body, queue);
    if (!body) return;
    setDraft(target, "");
    setPicked((all) => ({ ...all, [target]: [] }));
    const { data, error: failure } = await supabaseBrowser()
      .from("messages")
      .insert({ conversation_id: target, body })
      .select("*")
      .single();
    if (failure) {
      setDraft(target, typed);
      setPicked((all) => ({ ...all, [target]: mentions }));
      setError(
        body.length > 4000
          ? "That message is too long. Shorten it and try again."
          : "Your message wasn't sent. Try again."
      );
      return;
    }
    setError(null);
    showSent(target, data as Message);
  }

  // People in this conversation (not you) can be mentioned.
  const mentionablePeople = useMemo(
    () => members.filter((m) => m.id !== userId && participants.includes(m.id)),
    [members, userId, participants]
  );
  const projectName = useCallback(
    (id: string | null) => projects.find((p) => p.id === id)?.name,
    [projects]
  );
  const mentionOptions = useMentionSearch({
    query: mention?.query ?? null,
    orgId: org.id,
    people: mentionablePeople,
    projectName,
  });
  const mentionActive = Math.min(mentionIndex, Math.max(0, mentionOptions.length - 1));

  function onDraftChange(target: string, text: string, caret: number) {
    setDraft(target, text);
    const next = mentionQuery(text, caret);
    if (next?.query !== mention?.query || next?.start !== mention?.start) setMentionIndex(0);
    setMention(next);
  }

  function pickMention(option: MentionOption) {
    const target = activeId;
    const box = input.current;
    if (!target || !mention || !box) return;
    const caret = box.selectionStart ?? draft.length;
    const insert = `@${option.label} `;
    const text = draft.slice(0, mention.start) + insert + draft.slice(caret);
    setDraft(target, text);
    setPicked((all) => ({
      ...all,
      [target]: [
        ...(all[target] ?? []).filter((m) => m.label !== option.label),
        { kind: option.kind, id: option.id, label: option.label },
      ],
    }));
    setMention(null);
    const at = mention.start + insert.length;
    requestAnimationFrame(() => {
      box.focus();
      box.setSelectionRange(at, at);
    });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (mention) {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        if (!mentionOptions.length) return;
        event.preventDefault();
        const step = event.key === "ArrowDown" ? 1 : -1;
        setMentionIndex((mentionActive + step + mentionOptions.length) % mentionOptions.length);
        return;
      }
      if ((event.key === "Enter" || event.key === "Tab") && mentionOptions[mentionActive]) {
        event.preventDefault();
        pickMention(mentionOptions[mentionActive]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setMention(null);
        return;
      }
    }
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      send();
    }
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    if (!activeId || !event.clipboardData.files.length) return;
    event.preventDefault();
    addFiles(activeId, event.clipboardData.files);
  }

  const dragHasFiles = (event: DragEvent) => event.dataTransfer.types.includes("Files");

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
  const busy = Boolean(sending && sending.id === activeId);
  const compressing = pending.some((p) => p.compressing);

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

      <main
        className={`thread${dropping ? " is-dropping" : ""}`}
        onDragOver={(e) => {
          if (!active || !dragHasFiles(e)) return;
          e.preventDefault();
          setDropping(true);
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
        }}
        onDrop={(e) => {
          if (!active || !dragHasFiles(e)) return;
          e.preventDefault();
          setDropping(false);
          addFiles(active.id, e.dataTransfer.files);
        }}
      >
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
                const previous = messages[index - 1];
                const newDay =
                  !previous ||
                  startOfDay(new Date(previous.created_at)) !== startOfDay(new Date(message.created_at));
                const first = newDay || previous?.sender_id !== message.sender_id;
                const attachments = message.attachments ?? [];
                const time = (
                  <time className="msg-time" dateTime={message.created_at} title={new Date(message.created_at).toLocaleString()}>
                    {timeLabel(message.created_at)}
                  </time>
                );
                return (
                  <Fragment key={message.id}>
                  {newDay && (
                    <li className="msg-day" aria-label={dayLabel(message.created_at)}>
                      <span>{dayLabel(message.created_at)}</span>
                    </li>
                  )}
                  <li
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
                      {attachments.length > 0 && (
                        <MessageFiles messageId={message.id} files={attachments} />
                      )}
                      {message.body.trim() ? (
                        <p className="bubble">
                          <MessageText
                            body={message.body}
                            userId={userId}
                            onOpenItem={openItem}
                          />
                          {time}
                        </p>
                      ) : (
                        <p className="msg-time-solo">{time}</p>
                      )}
                    </div>
                  </li>
                  </Fragment>
                );
              })}
              <div ref={bottom} />
            </ol>
            {dropping && (
              <div className="thread-drop" aria-hidden="true">
                <Paperclip size={22} />
                Drop files to send to {nameOf(active)}
              </div>
            )}
            {error && (
              <p className="error thread-error" role="alert">
                {error}
              </p>
            )}
            {pending.length > 0 && (
              <ul className="composer-files" aria-label="Files to send">
                {pending.map((p) => (
                  <li key={p.id} className="composer-file">
                    {p.preview && p.file.type.startsWith("image/") ? (
                      <img src={p.preview} alt="" />
                    ) : p.preview ? (
                      <video src={p.preview} muted preload="metadata" />
                    ) : (
                      <FileText size={20} aria-hidden="true" />
                    )}
                    <span className="composer-file-text">
                      <strong title={p.file.name}>{p.file.name}</strong>
                      <small>
                        {p.compressing
                          ? `Compressing ${formatBytes(p.file.size)}…`
                          : p.originalSize
                            ? `${formatBytes(p.originalSize)} → ${formatBytes(p.file.size)}`
                            : formatBytes(p.file.size)}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="btn-plain"
                      disabled={busy}
                      onClick={() => removeFile(active.id, p.id)}
                      aria-label={`Remove ${p.file.name}`}
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <form className="composer" onSubmit={send}>
              {mention && (
                <MentionList
                  options={mentionOptions}
                  active={mentionActive}
                  onPick={pickMention}
                  onHover={setMentionIndex}
                />
              )}
              <input
                ref={picker}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  if (e.target.files) addFiles(active.id, e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                className="btn btn-icon composer-attach"
                onClick={() => picker.current?.click()}
                disabled={busy}
                aria-label="Attach pictures, videos or files"
                title="Attach pictures, videos or files (up to 50 MB each)"
              >
                <Paperclip size={16} />
              </button>
              <textarea
                ref={input}
                rows={1}
                value={draft}
                maxLength={4000}
                aria-label={`Message ${nameOf(active)}`}
                aria-autocomplete="list"
                placeholder={`Message ${nameOf(active)}... (@ to mention, Enter to send)`}
                onChange={(e) => onDraftChange(active.id, e.target.value, e.target.selectionStart)}
                onSelect={(e) => {
                  // Moving the caret away from an "@word" closes the picker.
                  const box = e.currentTarget;
                  const next = mentionQuery(box.value, box.selectionStart);
                  if (next?.start !== mention?.start || next?.query !== mention?.query) setMention(next);
                }}
                onBlur={() => setMention(null)}
                onKeyDown={onKeyDown}
                onPaste={onPaste}
              />
              <button
                className="btn btn-primary"
                disabled={busy || compressing || (!draft.trim() && !pending.length)}
                title="Send message"
              >
                <Send size={15} />
                <span>{busy ? `Sending ${sending?.percent ?? 0}%` : "Send"}</span>
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

/** Message text with mentions as chips. Tasks and tools open their details. */
function MessageText({
  body,
  userId,
  onOpenItem,
}: {
  body: string;
  userId: string;
  onOpenItem: (id: string) => void;
}) {
  return (
    <>
      {parseMentions(body).map((part, i) => {
        if ("text" in part) return <Fragment key={i}>{part.text}</Fragment>;
        const m = part.mention;
        if (m.kind === "user") {
          return (
            <span key={i} className={`mention mention-user${m.id === userId ? " mention-me" : ""}`}>
              @{m.label}
            </span>
          );
        }
        return (
          <button
            key={i}
            type="button"
            className={`mention mention-${m.kind}`}
            onClick={() => onOpenItem(m.id)}
            title={`Open ${m.kind} “${m.label}”`}
          >
            @{m.label}
          </button>
        );
      })}
    </>
  );
}

/** Pictures and videos play inline; anything else is a card to download. */
function MessageFiles({ messageId, files }: { messageId: string; files: Attachment[] }) {
  return (
    <div className="msg-files">
      {files.map((file, index) => {
        const url = `/api/chat/files/${messageId}/${index}`;
        const kind = fileKind(file.type);
        if (kind === "image") {
          return (
            <a key={index} href={url} target="_blank" rel="noreferrer" className="msg-image" title={file.name}>
              <img src={url} alt={file.name} loading="lazy" />
            </a>
          );
        }
        if (kind === "video") {
          return <video key={index} className="msg-video" src={url} controls preload="metadata" aria-label={file.name} />;
        }
        if (kind === "audio") {
          return <audio key={index} className="msg-audio" src={url} controls preload="none" aria-label={file.name} />;
        }
        return (
          <a key={index} href={`${url}?download=1`} className="msg-file" title={`Download ${file.name}`}>
            <FileText size={22} aria-hidden="true" />
            <span className="msg-file-text">
              <strong>{file.name}</strong>
              <small>{formatBytes(file.size)}</small>
            </span>
            <Download size={16} aria-hidden="true" />
          </a>
        );
      })}
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
