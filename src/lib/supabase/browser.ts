import { createBrowserClient } from "@supabase/ssr";

let client: ReturnType<typeof createBrowserClient> | undefined;

export function supabaseBrowser() {
  client ??= createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
  return client;
}

let channelSeq = 0;

/**
 * Listens for row changes as the signed-in user. The session is loaded before
 * joining: a channel that joins first is treated as anonymous, and RLS then
 * blanks every event it receives.
 *
 * Each call gets its own channel. Supabase hands back the existing channel
 * when a name is reused, and adding a listener to an already-subscribed
 * channel throws, so two components watching the same table (or a remount
 * before the old channel is gone) must not share a name.
 */
export function subscribeToTable(
  name: string,
  listen: { event: "*" | "INSERT"; table: "items" | "messages" | "projects" | "milestones"; filter?: string },
  onChange: (row: Record<string, unknown>) => void,
): () => void {
  const supabase = supabaseBrowser();
  let channel: ReturnType<typeof supabase.channel> | undefined;
  let stopped = false;
  const topic = `${name}-${++channelSeq}`;

  (async () => {
    const { data } = await supabase.auth.getSession();
    if (stopped || !data.session) return;
    await supabase.realtime.setAuth(data.session.access_token);
    if (stopped) return;
    channel = supabase
      .channel(topic)
      .on(
        "postgres_changes",
        { schema: "public", event: listen.event, table: listen.table, filter: listen.filter },
        (payload: { new: Record<string, unknown> }) => onChange(payload.new),
      )
      .subscribe();
  })();

  return () => {
    stopped = true;
    if (channel) supabase.removeChannel(channel);
  };
}
