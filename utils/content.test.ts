import { expect, test, describe } from 'bun:test';
import { calculateContentStats, summarizeContent, SummaryLength, SummaryFormat } from './content';

describe('Content Utils', () => {
  describe('calculateContentStats', () => {
    test('should correctly count words and characters', () => {
      const text = 'Hello world. This is a test.';
      const stats = calculateContentStats(text);
      expect(stats.wordCount).toBe(6);
      expect(stats.charCount).toBe(text.length);
    });

    test('should handle markdown syntax', () => {
      const text = '# Hello **world**. This is a `test`.';
      const stats = calculateContentStats(text);
      expect(stats.wordCount).toBe(6); // Markdown symbols should be stripped
    });

    test('should calculate reading time', () => {
        // 225 words should be 1 minute
        const words = Array(225).fill('word').join(' ');
        const stats = calculateContentStats(words);
        expect(stats.readingTime).toBe(1);

        // 450 words should be 2 minutes
        const moreWords = Array(451).fill('word').join(' ');
        const moreStats = calculateContentStats(moreWords);
        expect(moreStats.readingTime).toBe(3); // ceil(451/225) = 3
    });

    test('should count paragraphs', () => {
        const text = 'Para 1.\n\nPara 2.\n\nPara 3.';
        const stats = calculateContentStats(text);
        expect(stats.paragraphs).toBe(3);
    });
  });

  describe('summarizeContent', () => {
    const longText = `
      This is the first sentence.
      This is the second sentence.
      This is the third sentence.
      This is the fourth sentence.
      This is the fifth sentence.
      This is the sixth sentence.
      This is the seventh sentence.
      This is the eighth sentence.
    `;

    test('should handle empty content', () => {
      expect(summarizeContent('')).toBe('Not enough content to summarize.');
    });

    test('should return original content if short enough', () => {
       const text = 'Just one sentence.';
       expect(summarizeContent(text)).toBe(text);
    });

    test('should respect length parameter (short)', () => {
        // 'short' maps to 2 sentences
        const summary = summarizeContent(longText, 'short');
        const sentences = summary.match(/[^.!?\n]+[.!?\n]+/g) || [];
        expect(sentences.length).toBeLessThanOrEqual(2);
    });

    test('should respect length parameter (medium)', () => {
        // 'medium' maps to 3 sentences
        const summary = summarizeContent(longText, 'medium');
        const sentences = summary.match(/[^.!?\n]+[.!?\n]+/g) || [];
        expect(sentences.length).toBeLessThanOrEqual(3);
    });

     test('should respect length parameter (long)', () => {
        // 'long' maps to 7 sentences
        const summary = summarizeContent(longText, 'long');
        const sentences = summary.match(/[^.!?\n]+[.!?\n]+/g) || [];
        expect(sentences.length).toBeLessThanOrEqual(7);
    });

    test('should respect numeric length parameter', () => {
        const summary = summarizeContent(longText, 4);
        const sentences = summary.match(/[^.!?\n]+[.!?\n]+/g) || [];
        expect(sentences.length).toBeLessThanOrEqual(4);
    });

    test('should format as bullets', () => {
        const summary = summarizeContent(longText, 'short', 'bullets');
        expect(summary).toContain('- ');
        expect(summary.split('\n').length).toBeGreaterThan(1);
    });

    test('should format as paragraph', () => {
        const summary = summarizeContent(longText, 'short', 'paragraph');
        expect(summary).not.toContain('- ');
        // Paragraph format joins with spaces
        expect(summary).not.toContain('\n-');
    });
  });
});
