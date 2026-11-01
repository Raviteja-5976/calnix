"use client";

import dynamic from "next/dynamic";

// "Today" and date formatting depend on the viewer's time zone and locale, which
// the server doesn't know, so the calendar renders only in the browser.
export const CalendarLoader = dynamic(
  () => import("./CalendarView").then((module) => module.CalendarView),
  { ssr: false, loading: () => <p className="muted calendar-loading">Loading calendar</p> },
);
