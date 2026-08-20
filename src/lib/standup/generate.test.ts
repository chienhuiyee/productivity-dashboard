import { describe, expect, it } from "vitest";
import { ClaudeUnavailableError, extractText } from "./generate";

describe("extractText", () => {
  it("returns the text of a single text block", () => {
    expect(extractText([{ type: "text", text: "Yesterday: shipped X" }])).toBe("Yesterday: shipped X");
  });

  it("concatenates multiple text blocks in order", () => {
    expect(extractText([{ type: "text", text: "a" }, { type: "text", text: "b" }])).toBe("ab");
  });

  it("skips thinking blocks, which adaptive thinking emits alongside text", () => {
    expect(
      extractText([
        { type: "thinking", thinking: "internal reasoning" },
        { type: "text", text: "the answer" },
      ]),
    ).toBe("the answer");
  });

  it("returns an empty string when there is no text block", () => {
    expect(extractText([{ type: "thinking", thinking: "only reasoning" }])).toBe("");
    expect(extractText([])).toBe("");
  });

  it("trims surrounding whitespace", () => {
    expect(extractText([{ type: "text", text: "  padded  " }])).toBe("padded");
  });

  it("ignores malformed blocks rather than throwing", () => {
    expect(extractText([null, undefined, { type: "text" }, { text: "orphan" }, { type: "text", text: "ok" }])).toBe("ok");
  });
});

describe("ClaudeUnavailableError", () => {
  it("is an Error, so the route's instanceof check still routes it to aiError", () => {
    const err = new ClaudeUnavailableError("nope");
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe("nope");
  });
});
