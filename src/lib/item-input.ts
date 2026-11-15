import { z } from "zod";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date");
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Use a valid time");
const emptyToNull = <T extends z.ZodType>(schema: T) =>
  z.preprocess((v) => (v === "" || v === undefined ? null : v), schema.nullable());

export const itemInput = z
  .object({
    team_id: z.uuid(),
    kind: z.enum(["task", "event", "tool", "prompt"]),
    scope: z.enum(["personal", "team"]),
    title: z.string().trim().min(1, "Add a title").max(200),
    details: emptyToNull(z.string().max(10000)),
    summary: emptyToNull(z.string().trim().max(2000)),
    url: emptyToNull(z.url().regex(/^https?:\/\//i, "Use an http or https link").max(2000)),
    prompt_body: emptyToNull(z.string().max(50000)),
    start_date: emptyToNull(date),
    end_date: emptyToNull(date),
    start_time: emptyToNull(time),
    end_time: emptyToNull(time),
    assignee_id: emptyToNull(z.uuid()),
    project_id: emptyToNull(z.uuid()),
    milestone_id: emptyToNull(z.uuid()),
    parent_id: emptyToNull(z.uuid()),
    status: z.enum(["todo", "in_progress", "blocked", "done"]).default("todo"),
    priority: z.enum(["none", "low", "medium", "high", "urgent"]).default("none"),
    labels: z
      .array(z.string().trim().toLowerCase().min(1).max(30))
      .max(10, "Use at most 10 labels")
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "event" && !v.start_date) {
      ctx.addIssue({ code: "custom", path: ["start_date"], message: "Pick a start date" });
    }
    if (v.kind === "task" && !v.start_date && !v.project_id) {
      ctx.addIssue({ code: "custom", path: ["start_date"], message: "Pick a date, or add the task to a project" });
    }
    if (v.kind === "prompt" && !v.prompt_body?.trim()) {
      ctx.addIssue({ code: "custom", path: ["prompt_body"], message: "Paste the prompt text" });
    }
    if (v.kind === "tool" && !v.url) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "Add a link to the tool" });
    }
    if (v.start_date && v.end_date && v.end_date < v.start_date) {
      ctx.addIssue({ code: "custom", path: ["end_date"], message: "End date is before the start date" });
    }
    if (v.kind !== "task" && (v.project_id || v.milestone_id)) {
      ctx.addIssue({ code: "custom", path: ["project_id"], message: "Only tasks can belong to a project" });
    }
  })
  .transform((v) => ({
    ...v,
    // A single date means a one-day item.
    end_date: v.start_date ? (v.end_date ?? v.start_date) : null,
    assignee_id: v.scope === "personal" ? null : v.assignee_id,
    milestone_id: v.project_id ? v.milestone_id : null,
    labels: [...new Set(v.labels)],
  }));

export type ItemInput = z.output<typeof itemInput>;
