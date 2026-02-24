export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryFormat = 'paragraph' | 'bullets';

export interface ContentStats {
  wordCount: number;
  charCount: number;
  readingTime: number; // in minutes
  paragraphs: number;
}

// Function to calculate content statistics
export function calculateContentStats(content: string): ContentStats {
  // Remove markdown syntax for more accurate counting
  const plainText = content
    .replace(/[#*_`~\[\]()]/g, '') // Remove markdown symbols
    .replace(/!\[.*?\]\(.*?\)/g, '') // Remove images
    .replace(/\[.*?\]\(.*?\)/g, '') // Remove links
    .replace(/```[\s\S]*?```/g, '') // Remove code blocks
    .replace(/`[^`]*`/g, '') // Remove inline code
    .trim();

  const words = plainText.split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;
  const charCount = plainText.length;

  // Average reading speed is 200-250 words per minute, we'll use 225
  const readingTime = Math.ceil(wordCount / 225);

  // Count paragraphs (split by double newlines)
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

  return {
    wordCount,
    charCount,
    readingTime: Math.max(1, readingTime), // Minimum 1 minute
    paragraphs
  };
}

// Function to generate a simple summary
export function summarizeContent(content: string, sentenceCount: number | SummaryLength = 3): string {
  if (!content) {
    return "Not enough content to summarize.";
  }

  let count: number;
  if (typeof sentenceCount === 'string') {
    switch (sentenceCount) {
      case 'short': count = 1; break;
      case 'medium': count = 3; break;
      case 'long': count = 5; break;
      default: count = 3;
    }
  } else {
    count = sentenceCount;
  }

  // A simple sentence tokenizer that handles various endings.
  const sentences = content.match(/[^.!?\n]+[.!?\n]+/g) || [];

  if (sentences.length === 0) {
    // Fallback for content without clear sentence endings
    return content.length > 250 ? content.substring(0, 250) + '...' : content;
  }

  const summary = sentences.slice(0, count).map(s => s.trim()).join(' ');

  return summary || "Could not generate a summary.";
}
