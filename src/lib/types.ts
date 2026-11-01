export type ItemKind = "task" | "event" | "tool" | "prompt";
export type ItemScope = "personal" | "team";
export type Role = "owner" | "admin" | "member";

export interface Profile {
  id: string;
  full_name: string;
  color: string;
}

export interface Member extends Profile {
  role: Role;
  teamIds: string[];
}

export interface Team {
  id: string;
  org_id: string;
  name: string;
}

export interface Organization {
  id: string;
  name: string;
}

export interface Item {
  id: string;
  org_id: string;
  team_id: string;
  owner_id: string;
  assignee_id: string | null;
  kind: ItemKind;
  scope: ItemScope;
  title: string;
  details: string | null;
  url: string | null;
  prompt_body: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: "todo" | "done";
  ai_status: "pending" | "ready" | "failed";
  ai_description: string | null;
  ai_error: string | null;
  ai_requested_at: string | null;
  image_key: string | null;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  kind: "dm" | "group" | "team";
  name: string | null;
  team_id: string | null;
  last_message_at: string | null;
  last_body: string | null;
  other_user_id: string | null;
  unread: number;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
}

export const KIND_LABEL: Record<ItemKind, string> = {
  task: "Task",
  event: "Event",
  tool: "Tool",
  prompt: "Prompt",
};
