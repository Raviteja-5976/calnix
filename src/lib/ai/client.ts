"use client";

import type { FeatureName, FeatureResult } from "./features";
import { today } from "../dates";

/** Calls an AI feature as the signed-in user. Throws with a message fit to show. */
export async function runAi<N extends FeatureName>(
  feature: N,
  orgId: string,
  input: Record<string, unknown>,
): Promise<FeatureResult<N>> {
  const response = await fetch(`/api/ai/${feature}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, orgId, today: today() }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error ?? "The AI request failed. Try again.");
  return body as FeatureResult<N>;
}
