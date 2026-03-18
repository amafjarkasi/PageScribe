import { expect, test, describe } from "bun:test";
import { summarizeContent, calculateContentStats } from "../utils/content";

describe("summarizeContent (Advanced)", () => {
  const content = `
    Artificial intelligence (AI) is intelligence demonstrated by machines, in contrast to the natural intelligence displayed by humans and animals.
    Leading AI textbooks define the field as the study of "intelligent agents": any device that perceives its environment and takes actions that maximize its chance of successfully achieving its goals.
    Colloquially, the term "artificial intelligence" is often used to describe machines (or computers) that mimic "cognitive" functions that humans associate with the human mind, such as "learning" and "problem solving".
    As machines become increasingly capable, tasks considered to require "intelligence" are often removed from the definition of AI, a phenomenon known as the AI effect.
    For instance, optical character recognition is frequently excluded from things considered to be AI, having become a routine technology.
    Modern machine capabilities generally classified as AI include successfully understanding human speech, competing at the highest level in strategic game systems (such as chess and Go), autonomously operating cars, intelligent routing in content delivery networks, and military simulations.
    AI was founded as an academic discipline in 1956, and in the years since has experienced several waves of optimism, followed by disappointment and the loss of funding (known as an "AI winter"), followed by new approaches, success and renewed funding.
    AI research has been defined by different sub-fields that often fail to communicate with each other.
    These sub-fields are based on technical considerations, such as particular goals (e.g. "robotics" or "machine learning"), the use of particular tools ("logic" or artificial neural networks), or deep philosophical differences.
    Sub-fields have also been based on social factors (particular institutions or the work of particular researchers).
  `;

  test("should select top sentences based on word frequency", () => {
    const result = summarizeContent(content, 'short');
    // The short summary should contain key terms like "Artificial intelligence" or "intelligence"
    expect(result.toLowerCase()).toContain("artificial intelligence");
    expect(result.split('.').length).toBeGreaterThanOrEqual(1);
  });

  test("should respect length constraints", () => {
    const shortResult = summarizeContent(content, 'short');
    const mediumResult = summarizeContent(content, 'medium');
    const longResult = summarizeContent(content, 'long');

    expect(mediumResult.length).toBeGreaterThan(shortResult.length);
    expect(longResult.length).toBeGreaterThan(mediumResult.length);
  });

  test("should restore original sentence order", () => {
    const result = summarizeContent(content, 'medium');
    const sentences = result.match(/[^.!?\n]+[.!?\n]+/g) || [];

    // Check if sentences in summary appear in the same relative order as in the original content
    let lastIndex = -1;
    sentences.forEach(s => {
      const currentIndex = content.indexOf(s.trim());
      expect(currentIndex).toBeGreaterThan(lastIndex);
      lastIndex = currentIndex;
    });
  });
});

describe("calculateContentStats", () => {
  test("should accurately count words and characters", () => {
    const text = "Hello world. This is a test.";
    const stats = calculateContentStats(text);
    expect(stats.wordCount).toBe(6);
    expect(stats.charCount).toBe(text.length);
  });

  test("should handle markdown", () => {
    const markdown = "# Title\n\n**Bold** [link](url)";
    const stats = calculateContentStats(markdown);
    // "Title Bold link"
    expect(stats.wordCount).toBe(3);
  });
});
