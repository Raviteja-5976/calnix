import { describe, expect, it } from "vitest";
import { cleanLabel, encodeMentions, mentionQuery, parseMentions, type Mention } from "./mentions";

const ravi: Mention = { kind: "user", id: "11111111-1111-1111-1111-111111111111", label: "Ravi" };
const raviTeja: Mention = { kind: "user", id: "22222222-2222-2222-2222-222222222222", label: "Ravi Teja" };
const task: Mention = { kind: "task", id: "33333333-3333-3333-3333-333333333333", label: "Fix login bug" };

describe("encodeMentions / parseMentions", () => {
  it("round-trips picked mentions", () => {
    const body = encodeMentions("hi @Ravi, see @Fix login bug.", [ravi, task]);
    expect(body).toBe(`hi @[Ravi](user:${ravi.id}), see @[Fix login bug](task:${task.id}).`);
    expect(parseMentions(body)).toEqual([
      { text: "hi " },
      { mention: ravi },
      { text: ", see " },
      { mention: task },
      { text: "." },
    ]);
  });

  it("prefers the longer label and skips partial words", () => {
    expect(encodeMentions("@Ravi Teja and @Ravikiran", [ravi, raviTeja])).toBe(
      `@[Ravi Teja](user:${raviTeja.id}) and @Ravikiran`,
    );
  });

  it("drops mentions whose text was deleted", () => {
    expect(encodeMentions("just text", [ravi])).toBe("just text");
  });

  it("leaves plain text alone", () => {
    expect(parseMentions("no mentions [here](x)")).toEqual([{ text: "no mentions [here](x)" }]);
  });
});

describe("mentionQuery", () => {
  it("finds the @word before the caret", () => {
    expect(mentionQuery("hello @ra", 9)).toEqual({ start: 6, query: "ra" });
    expect(mentionQuery("@", 1)).toEqual({ start: 0, query: "" });
  });

  it("ignores emails and finished words", () => {
    expect(mentionQuery("mail me@x.com", 13)).toBeNull();
    expect(mentionQuery("@ravi done", 10)).toBeNull();
  });
});

it("cleanLabel strips token characters", () => {
  expect(cleanLabel(" [Draft]\nplan ")).toBe("Draft plan");
});
