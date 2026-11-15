"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "./supabase/browser";

export type SaveState = "saved" | "dirty" | "saving" | "conflict" | "error";

/**
 * Saves a document a moment after the last change. Each save only applies if
 * the doc is still at the version this person last saw; otherwise it reports
 * a conflict instead of silently overwriting a teammate's work.
 */
export function useAutosave(docId: string, initialVersion: number, delay = 1200) {
  const version = useRef(initialVersion);
  const pending = useRef<Record<string, unknown> | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [state, setStateValue] = useState<SaveState>("saved");
  const stateRef = useRef<SaveState>("saved");
  const setState = useCallback((next: SaveState) => {
    stateRef.current = next;
    setStateValue(next);
  }, []);
  const [error, setError] = useState<string | null>(null);

  const flush = useCallback(
    async (force = false) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      const changes = pending.current;
      if (!changes) return;
      pending.current = null;
      setState("saving");
      let query = supabaseBrowser().from("documents").update(changes).eq("id", docId);
      if (!force) query = query.eq("version", version.current);
      const { data, error: failure } = await query.select("version").maybeSingle();
      if (failure) {
        pending.current = { ...changes, ...(pending.current as Record<string, unknown> | null ?? {}) };
        setError(failure.message);
        setState("error");
        return;
      }
      if (!data) {
        pending.current = { ...changes, ...(pending.current as Record<string, unknown> | null ?? {}) };
        setState("conflict");
        return;
      }
      version.current = data.version;
      setError(null);
      setState(pending.current ? "dirty" : "saved");
    },
    [docId, setState],
  );

  const queue = useCallback(
    (changes: Record<string, unknown>) => {
      pending.current = { ...pending.current, ...changes };
      // While in conflict, keep collecting edits but wait for the person to choose.
      if (stateRef.current === "conflict") return;
      setState("dirty");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), delay);
    },
    [delay, flush, setState],
  );

  // Save on leave, and warn if the tab closes with unsaved work.
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current) event.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (pending.current) flush();
    };
  }, [flush]);

  return {
    state,
    error,
    queue,
    flush,
    /** Overwrite the newer version with this person's copy. */
    overwrite: () => flush(true),
    version: () => version.current,
  };
}
