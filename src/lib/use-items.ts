"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { subscribeToTable, supabaseBrowser } from "./supabase/browser";
import type { Item, ItemKind } from "./types";

interface Query {
  orgId: string;
  /** Items overlapping these days, for the calendar. */
  from?: string;
  to?: string;
  kinds?: ItemKind[];
}

/**
 * Loads items and keeps them current: changes from teammates arrive over
 * Realtime, and items still waiting on AI are also polled, so a dropped socket
 * can't leave an image stuck on "Creating".
 */
export function useItems({ orgId, from, to, kinds }: Query) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const kindKey = kinds?.join(",") ?? "";
  const request = useRef(0);

  const load = useCallback(async () => {
    const ticket = ++request.current;
    let query = supabaseBrowser().from("items").select("*").eq("org_id", orgId);
    if (from && to) query = query.lte("start_date", to).gte("end_date", from);
    if (kindKey) query = query.in("kind", kindKey.split(","));
    const { data, error: failure } = await query.order("created_at", { ascending: false }).limit(1000);
    if (ticket !== request.current) return; // A newer request has taken over.
    setLoading(false);
    if (failure) setError("Could not load items. Check your connection and reload.");
    else {
      setError(null);
      setItems((data ?? []) as Item[]);
    }
  }, [orgId, from, to, kindKey]);

  useEffect(() => {
    queueMicrotask(load);
    const unsubscribe = subscribeToTable(
      `items-${orgId}-${from ?? "all"}-${kindKey}`,
      { event: "*", table: "items" },
      () => load(),
    );
    window.addEventListener("calnix:items", load);
    return () => {
      window.removeEventListener("calnix:items", load);
      unsubscribe();
    };
  }, [load, orgId, from, kindKey]);

  const hasPending = items.some((i) => i.ai_status === "pending");
  useEffect(() => {
    if (!hasPending) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [hasPending, load]);

  return { items, loading, error };
}

/** Tell every open view that items changed, without waiting for Realtime. */
export const announceItemsChanged = () => window.dispatchEvent(new Event("calnix:items"));
