import { expect, test, describe } from "bun:test";
import { summarizeContent } from "../utils/content";

describe("summarizeContent", () => {
  const content = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. Sentence six.";

  test("should summarize with default settings (medium length, paragraph format)", () => {
    const result = summarizeContent(content);
    expect(result).toBe("Sentence one. Sentence two. Sentence three.");
  });

  test("should summarize with short length", () => {
    const result = summarizeContent(content, 'short');
    expect(result).toBe("Sentence one.");
  });

  test("should summarize with long length", () => {
    const result = summarizeContent(content, 'long');
    expect(result).toBe("Sentence one. Sentence two. Sentence three. Sentence four. Sentence five. Sentence six.");
  });

  test("should summarize with bullets format", () => {
    const result = summarizeContent(content, 'short', 'bullets');
    expect(result).toBe("- Sentence one.");
  });

  test("should handle empty content", () => {
    const result = summarizeContent("");
    expect(result).toBe("Not enough content to summarize.");
  });
});
