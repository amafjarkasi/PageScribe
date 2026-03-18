import { expect, test, describe } from "bun:test";
import { analyzeSentiment, calculateReadability, extractEntities, generateTableOfContents } from "../utils/content";

describe("Content Intelligence", () => {
  test("analyzeSentiment should detect positive and negative words", () => {
    const text = "This is a great and amazing product. It is easy and simple.";
    const result = analyzeSentiment(text);
    expect(result.type).toBe('positive');
    expect(result.score).toBeGreaterThan(0);

    const badText = "This is a bad and awful product. It is useless and broken.";
    const badResult = analyzeSentiment(badText);
    expect(badResult.type).toBe('negative');
    expect(badResult.score).toBeLessThan(0);
  });

  test("calculateReadability should return reasonable scores", () => {
    const text = "This is a simple sentence. It is easy to read.";
    const result = calculateReadability(text);
    expect(result.fleschEase).toBeGreaterThan(0);
    expect(result.fleschKincaidGrade).toBeLessThan(12);
  });

  test("extractEntities should find emails and urls", () => {
    const text = "Contact me at test@example.com or visit https://example.com";
    const result = extractEntities(text);
    expect(result.emails).toContain('test@example.com');
    expect(result.urls).toContain('https://example.com');
  });

  test("generateTableOfContents should parse markdown headers", () => {
    const markdown = "# Title\n## Section 1\n### Subsection 1.1\n## Section 2";
    const result = generateTableOfContents(markdown);
    expect(result.length).toBe(4);
    expect(result[0].level).toBe(1);
    expect(result[0].text).toBe('Title');
    expect(result[2].level).toBe(3);
    expect(result[2].text).toBe('Subsection 1.1');
  });
});
