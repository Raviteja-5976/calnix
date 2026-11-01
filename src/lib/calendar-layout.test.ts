import { describe, expect, it } from "vitest";
import { itemsOnDay, layoutWeek } from "./calendar-layout";
import { addMonths, monthWeeks, startOfWeek, today } from "./dates";

const item = (id: string, start: string, end = start, start_time: string | null = null) => ({
  id, title: id, start_date: start, end_date: end, start_time,
});

// The week of Sunday 2026-11-01 to Saturday 2026-11-07.
const WEEK = "2026-11-01";

describe("layoutWeek", () => {
  it("clips a band running through the week and marks both ends", () => {
    const { bars } = layoutWeek([item("a", "2026-10-28", "2026-11-12")], WEEK, 3);
    expect(bars[0]).toMatchObject({ column: 0, span: 7, continuesBefore: true, continuesAfter: true });
  });

  it("gives a bar inside the week its exact column and length", () => {
    const { bars } = layoutWeek([item("a", "2026-11-03", "2026-11-05")], WEEK, 3);
    expect(bars[0]).toMatchObject({ column: 2, span: 3, continuesBefore: false, continuesAfter: false });
  });

  it("never overlaps bars in one lane", () => {
    const { bars } = layoutWeek(
      [item("a", "2026-11-01", "2026-11-03"), item("b", "2026-11-02", "2026-11-04"), item("c", "2026-11-04")],
      WEEK,
      5,
    );
    const lanes = new Map(bars.map((b) => [b.item.id, b.lane]));
    expect(lanes.get("a")).toBe(0);
    expect(lanes.get("b")).toBe(1);
    expect(lanes.get("c")).toBe(0);
  });

  it("puts multi-day bands above single-day items that start earlier", () => {
    const { bars } = layoutWeek([item("single", "2026-11-02"), item("long", "2026-11-02", "2026-11-06")], WEEK, 3);
    expect(bars.find((b) => b.item.id === "long")?.lane).toBe(0);
  });

  it("counts overflow on every day a hidden item covers", () => {
    const { bars, hidden } = layoutWeek(
      [item("a", "2026-11-02", "2026-11-03"), item("b", "2026-11-02", "2026-11-03")],
      WEEK,
      1,
    );
    expect(bars).toHaveLength(1);
    expect(hidden).toEqual([0, 1, 1, 0, 0, 0, 0]);
  });

  it("ignores undated items and items outside the week", () => {
    const { bars } = layoutWeek(
      [{ id: "x", title: "x", start_date: null, end_date: null }, item("y", "2026-11-08")],
      WEEK,
      3,
    );
    expect(bars).toHaveLength(0);
  });
});

describe("itemsOnDay", () => {
  it("includes spanning items and orders timed ones first", () => {
    const found = itemsOnDay(
      [item("span", "2026-11-01", "2026-11-09"), item("late", "2026-11-03", "2026-11-03", "15:00"),
       item("early", "2026-11-03", "2026-11-03", "09:00"), item("other", "2026-11-04")],
      "2026-11-03",
    );
    expect(found.map((i) => i.id)).toEqual(["early", "late", "span"]);
  });
});

describe("dates", () => {
  it("finds the week start across a month boundary", () => {
    expect(startOfWeek("2026-12-02")).toBe("2026-11-29");
  });
  it("covers the whole month, including a daylight saving change", () => {
    const weeks = monthWeeks("2026-03-15");
    expect(weeks[0]).toBe("2026-03-01");
    expect(weeks.at(-1)).toBe("2026-03-29");
  });
  it("adds months from the 31st without skipping a month", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-01");
  });
  it("uses the viewer's local day for today", () => {
    expect(today(new Date(2026, 10, 1, 23, 59))).toBe("2026-11-01");
  });
});

