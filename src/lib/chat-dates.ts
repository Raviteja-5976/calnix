/** Date labels for chat, in the viewer's local time zone. */

export const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** Whole calendar days between two moments (0 = same day). Safe across DST changes. */
export const daysAgo = (date: Date, now: Date) => Math.round((startOfDay(now) - startOfDay(date)) / 86_400_000);

/**
 * WhatsApp-style day headings:
 *   Today, Yesterday, a weekday for the rest of the past week ("Sunday"),
 *   then the date ("12 November"), with the year once it's not this year.
 */
export function dayLabel(iso: string, now = new Date(), locale?: string) {
  const date = new Date(iso);
  const days = daysAgo(date, now);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days > 1 && days < 7) return date.toLocaleDateString(locale, { weekday: "long" });
  return date.toLocaleDateString(locale, {
    day: "numeric",
    month: "long",
    year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
  });
}

export const timeLabel = (iso: string, locale?: string) =>
  new Date(iso).toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
