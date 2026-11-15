"use client";

import type { SaveState } from "@/lib/use-autosave";

const LABEL: Record<SaveState, string> = {
  saved: "Saved",
  dirty: "Unsaved changes",
  saving: "Saving…",
  conflict: "Not saved: newer version exists",
  error: "Save failed, retrying on next edit",
};

export function SaveBadge({ state, error }: { state: SaveState; error: string | null }) {
  return (
    <span className={`save-badge save-${state}`} role="status" title={error ?? undefined}>
      {LABEL[state]}
    </span>
  );
}
