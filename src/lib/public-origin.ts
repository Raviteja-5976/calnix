const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "0.0.0.0", "[::1]"]);

const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
const isLocal = (host: string) => LOCAL_HOSTS.has(host.replace(/:\d+$/, ""));

/**
 * The origin the visitor actually used, for building redirects.
 *
 * Behind a hosting proxy (such as AWS Amplify) `request.url` can carry the
 * server's internal address, e.g. http://localhost:3000, so redirects built
 * from it would send people to localhost. Use the first public host we can
 * find (the proxy's forwarded host, then the request's own host), and fall
 * back to the configured public site URL.
 */
export function publicOrigin(request: Request): string {
  const url = new URL(request.url);
  if (process.env.NODE_ENV === "development") return url.origin;

  const forwardedHost = first(request.headers.get("x-forwarded-host"));
  if (forwardedHost && !isLocal(forwardedHost)) {
    const proto = first(request.headers.get("x-forwarded-proto")) ?? "https";
    return `${proto}://${forwardedHost}`;
  }

  if (!isLocal(url.host)) return url.origin;

  const site = process.env.NEXT_PUBLIC_SITE_URL;
  return site ? new URL(site).origin : url.origin;
}
