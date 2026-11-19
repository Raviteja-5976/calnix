/** Time-zone maths for the daily summary. Pure functions, no dependencies. */

/** How long after the chosen time a missed summary may still go out. */
export const SEND_WINDOW_MINUTES = 180;

export function isValidTimeZone(tz: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/** The wall-clock date ("YYYY-MM-DD") and minutes after midnight in a zone. */
export function localParts(now: Date, timeZone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    minutes: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

/** "08:30" or "08:30:00" -> 510 */
export const timeToMinutes = (time: string) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};

/**
 * A summary is due once the chosen local time has passed today, for up to
 * SEND_WINDOW_MINUTES, and only if one hasn't been sent for today already.
 * The window stops a summary arriving late at night just because someone
 * switched it on in the evening.
 */
export function isDue(
  settings: { digest_time: string; timezone: string; last_digest_on: string | null },
  now: Date,
) {
  const zone = isValidTimeZone(settings.timezone) ? settings.timezone : "UTC";
  const local = localParts(now, zone);
  const since = local.minutes - timeToMinutes(settings.digest_time);
  const due = since >= 0 && since < SEND_WINDOW_MINUTES && settings.last_digest_on !== local.date;
  return { due, localDate: local.date, zone };
}

/** The UTC instant of local midnight today in a zone. */
export function startOfLocalDay(now: Date, timeZone: string) {
  const { date, minutes } = localParts(now, timeZone);
  const [y, m, d] = date.split("-").map(Number);
  // Offset of the zone right now, in minutes (wall clock minus UTC).
  const wall = Date.UTC(y, m - 1, d, Math.floor(minutes / 60), minutes % 60);
  const offset = Math.round((wall - Math.floor(now.getTime() / 60000) * 60000) / 60000);
  return new Date(Date.UTC(y, m - 1, d) - offset * 60000);
}
