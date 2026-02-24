import { expect, test, describe } from "bun:test";
import { summarizeContent, calculateContentStats } from "./content";

describe("calculateContentStats", () => {
  test("should calculate stats for simple text", () => {
    const content = "This is a simple sentence.";
    const stats = calculateContentStats(content);
    expect(stats.wordCount).toBe(5);
    expect(stats.charCount).toBe(26);
    expect(stats.readingTime).toBe(1);
    expect(stats.paragraphs).toBe(1);
  });

  test("should ignore markdown syntax", () => {
    const content = "# Title\n\nThis is a [link](https://example.com) and **bold** text.";
    const stats = calculateContentStats(content);
    // Plain text should be "Title\n\nThis is a link and bold text."
    // Words: Title, This, is, a, link, and, bold, text. (8 words)
    expect(stats.wordCount).toBe(8);
    expect(stats.paragraphs).toBe(2);
  });

  test("should handle multiple paragraphs", () => {
    const content = "Para 1.\n\nPara 2.\n\nPara 3.";
    const stats = calculateContentStats(content);
    expect(stats.paragraphs).toBe(3);
  });
});

describe("summarizeContent", () => {
  test("should return a message for empty content", () => {
    expect(summarizeContent("")).toBe("Not enough content to summarize.");
  });

  test("should summarize with default sentence count (3)", () => {
    const content = "Sentence one. Sentence two. Sentence three. Sentence four. Sentence five.";
    const result = summarizeContent(content);
    expect(result).toBe("Sentence one. Sentence two. Sentence three.");
  });

  test("should handle 'short' summary length", () => {
    const content = "Sentence one. Sentence two. Sentence three.";
    const result = summarizeContent(content, 'short');
    expect(result).toBe("Sentence one.");
  });

  test("should handle 'medium' summary length", () => {
    const content = "Sentence one. Sentence two. Sentence three. Sentence four.";
    const result = summarizeContent(content, 'medium');
    expect(result).toBe("Sentence one. Sentence two. Sentence three.");
  });

  test("should handle 'long' summary length", () => {
    const content = "S1. S2. S3. S4. S5. S6.";
    const result = summarizeContent(content, 'long');
    expect(result).toBe("S1. S2. S3. S4. S5.");
  });

  test("should handle custom numeric sentence count", () => {
    const content = "Sentence one. Sentence two. Sentence three.";
    const result = summarizeContent(content, 2);
    expect(result).toBe("Sentence one. Sentence two.");
  });

  test("should handle content with fewer sentences than requested", () => {
    const content = "Only one sentence.";
    const result = summarizeContent(content, 3);
    expect(result).toBe("Only one sentence.");
  });

  test("should use fallback for content without clear sentence endings", () => {
    const content = "This is a long piece of text without any proper sentence endings like periods or exclamation marks so the tokenizer should fail to find sentences and use the fallback substring logic instead which takes up to 250 characters of the content";
    const result = summarizeContent(content);
    // Since there are no sentence endings, it should return the content (as it's < 250 chars)
    expect(result).toBe(content);
  });

  test("should truncate very long content without sentence endings", () => {
    const longContent = "A".repeat(300);
    const result = summarizeContent(longContent);
    expect(result).toBe("A".repeat(250) + "...");
  });

  test("should handle various sentence endings", () => {
    const content = "Ending with period. Ending with question? Ending with exclamation! New line\nAnother sentence.";
    const result = summarizeContent(content, 5);
    // Note: the tokenizer includes the newline if it's considered part of the "ending" match [^.!?\n]+[.!?\n]+
    // In "New line\n", \n is matched by [.!?\n]+
    expect(result).toBe("Ending with period. Ending with question? Ending with exclamation! New line Another sentence.");
  });
});
