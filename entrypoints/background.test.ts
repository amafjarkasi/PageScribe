import { describe, it, expect } from 'vitest';
import { calculateContentStats, summarizeContent } from './background';

describe('calculateContentStats', () => {
  it('should calculate word count and reading time correctly', () => {
    const content = "This is a test sentence. It has ten words in total.";
    const stats = calculateContentStats(content);

    expect(stats.wordCount).toBe(11);
    // 10 words / 225 wpm ~ 0.04 min, ceil(0.04) = 1, max(1, 1) = 1
    expect(stats.readingTime).toBe(1);
  });

  it('should ignore markdown syntax', () => {
    // "**Bold** text and [a link](https://example.com)."
    // "Bold text and a link." -> 5 words
    const content = "**Bold** text and [a link](https://example.com).";
    const stats = calculateContentStats(content);

    expect(stats.wordCount).toBe(5);
  });

  it('should count paragraphs correctly', () => {
    const content = "Paragraph 1.\n\nParagraph 2.\n\nParagraph 3.";
    const stats = calculateContentStats(content);

    expect(stats.paragraphs).toBe(3);
  });
});

describe('summarizeContent', () => {
  it('should return the original content if it is short', () => {
    const shortContent = "Only one sentence.";
    const summary = summarizeContent(shortContent, 3);
    expect(summary).toBe(shortContent);
  });

  it('should handle empty input', () => {
    expect(summarizeContent('')).toBe("Not enough content to summarize.");
  });

  it('should return exactly N sentences if possible', () => {
      const content = "Sentence 1. Sentence 2. Sentence 3. Sentence 4. Sentence 5.";
      // With simple content, it might just pick based on length or index if scores are tied/zero.
      // But let's check the count.
      const summary = summarizeContent(content, 2);
      // The split logic relies on punctuation.
      const sentences = summary.match(/[^.!?\n]+[.!?\n]+/g) || [];
      expect(sentences.length).toBe(2);
  });
});
