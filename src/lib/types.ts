export type ItemKind = "task" | "event" | "tool" | "prompt";
export type ItemScope = "personal" | "team";
export type Role = "owner" | "admin" | "member";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done";
export type Priority = "none" | "low" | "medium" | "high" | "urgent";
export type ProjectStatus = "planning" | "active" | "on_hold" | "done";

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
  ai_enabled: boolean;
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
  summary: string | null;
  url: string | null;
  prompt_body: string | null;
  start_date: string | null;
  end_date: string | null;
  start_time: string | null;
  end_time: string | null;
  status: TaskStatus;
  ai_status: "idle" | "pending" | "ready" | "failed";
  ai_error: string | null;
  ai_requested_at: string | null;
  image_key: string | null;
  image_source: "upload" | "ai" | null;
  project_id: string | null;
  milestone_id: string | null;
  parent_id: string | null;
  priority: Priority;
  position: number;
  labels: string[];
  created_at: string;
  updated_at: string;
}

export interface Project {
  id: string;
  org_id: string;
  team_id: string;
  name: string;
  goal: string | null;
  description: string | null;
  status: ProjectStatus;
  lead_id: string | null;
  start_date: string | null;
  target_date: string | null;
  color: string;
  archived_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Milestone {
  id: string;
  org_id: string;
  team_id: string;
  project_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  status: "open" | "done";
  position: number;
}

export interface Folder {
  id: string;
  org_id: string;
  team_id: string;
  project_id: string | null;
  parent_id: string | null;
  name: string;
  position: number;
  deleted_at: string | null;
}

export type DocKind = "note" | "board";

export interface DocSummary {
  id: string;
  team_id: string;
  project_id: string | null;
  folder_id: string | null;
  kind: DocKind;
  title: string;
  version: number;
  deleted_at: string | null;
  updated_at: string;
  updated_by: string | null;
}

export interface Doc extends DocSummary {
  org_id: string;
  content: string;
  scene: unknown;
}

export interface Activity {
  id: number;
  actor_id: string | null;
  action: string;
  subject: string;
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

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
};

export const STATUSES: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: "No priority",
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const PRIORITIES: Priority[] = ["urgent", "high", "medium", "low", "none"];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On hold",
  done: "Done",
};
