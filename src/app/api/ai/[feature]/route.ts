import { NextResponse } from "next/server";
import { z } from "zod";
import { FEATURES, type FeatureName } from "@/lib/ai/features";
import { publicAiError } from "@/lib/ai/runware";
import { claimAi } from "@/lib/generate";
import { supabaseServer } from "@/lib/supabase/server";

export const maxDuration = 120;

const envelope = z.object({ orgId: z.uuid(), today: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });

/**
 * Every AI feature, started by a person clicking a button. Returns a draft for
 * them to review; nothing is saved here.
 */
export async function POST(request: Request, { params }: { params: Promise<{ feature: string }> }) {
  const { feature } = await params;
  if (!Object.hasOwn(FEATURES, feature)) {
    return NextResponse.json({ error: "Unknown AI feature" }, { status: 404 });
  }
  const supabase = await supabaseServer();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return NextResponse.json({ error: "Sign in first" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const head = envelope.safeParse(body);
  const spec = FEATURES[feature as FeatureName];
  const input = spec.input.safeParse(body);
  if (!head.success || !input.success) {
    return NextResponse.json({ error: "Check the request and try again" }, { status: 400 });
  }

  let claim: Awaited<ReturnType<typeof claimAi>>;
  try {
    claim = await claimAi(head.data.orgId, feature);
  } catch {
    return NextResponse.json({ error: "You are not in this organization" }, { status: 403 });
  }
  if (claim === "disabled") {
    return NextResponse.json({ error: "An admin has turned AI off for this organization." }, { status: 403 });
  }
  if (claim === "limited") {
    return NextResponse.json({ error: "You reached the hourly AI limit. Try again later." }, { status: 429 });
  }

  try {
    // The input type depends on the feature; each run validates its own.
    const run = spec.run as (input: unknown, ctx: Parameters<typeof spec.run>[1]) => Promise<unknown>;
    const result = await run(input.data, {
      supabase,
      userId: auth.user.id,
      orgId: head.data.orgId,
      today: head.data.today,
    });
    return NextResponse.json(result);
  } catch (error) {
    console.error(`AI feature ${feature} failed:`, error);
    return NextResponse.json({ error: publicAiError(error) }, { status: 502 });
  }
}
