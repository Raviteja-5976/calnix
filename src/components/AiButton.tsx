"use client";

import { Loader2, Sparkles } from "lucide-react";

/** The one look for every "do this with AI" action. AI only ever runs from here. */
export function AiButton({
  children,
  busy,
  disabled,
  onClick,
  title,
  small = true,
}: {
  children: React.ReactNode;
  busy?: boolean;
  disabled?: boolean;
  onClick: () => void;
  title?: string;
  small?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn btn-ai${small ? " btn-small" : ""}`}
      onClick={onClick}
      disabled={disabled || busy}
      title={title}
      aria-busy={busy || undefined}
    >
      {busy ? <Loader2 size={13} className="spin" aria-hidden="true" /> : <Sparkles size={13} aria-hidden="true" />}
      <span>{busy ? "Working…" : children}</span>
    </button>
  );
}
