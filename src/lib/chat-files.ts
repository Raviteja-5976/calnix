import { supabaseServer } from "@/lib/supabase/server";

/** Most files one message can carry. Matches the database check. */
export const MAX_ATTACHMENTS = 10;

/** Where a conversation's files live inside the chat-files prefix. */
export const chatPrefix = (orgId: string, conversationId: string) => `orgs/${orgId}/chat/${conversationId}/`;

/**
 * The signed-in user and the conversation, if they are in it. RLS only returns
 * conversations the caller is a member of, so a row back means access.
 */
export async function conversationForUser(conversationId: string) {
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { status: 401 as const, error: "Sign in first" };
  const { data: conversation } = await supabase
    .from("conversations")
    .select("id, org_id")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conversation) return { status: 404 as const, error: "Conversation not found" };
  return { userId: auth.user.id, conversation: conversation as { id: string; org_id: string } };
}

/** Keeps a file name readable but safe to put in a storage key. */
export function keySafeName(name: string) {
  const cleaned = name
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[._]+/, "")
    .slice(-80);
  return cleaned || "file";
}
