export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryFormat = 'paragraph' | 'bullets';

export interface ContentStats {
  wordCount: number;
  charCount: number;
  readingTime: number; // in minutes
  paragraphs: number;
}

export function calculateContentStats(content: string): ContentStats {
  const plainText = content
    .replace(/[#*_`~\[\]()]/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[.*?\]\(.*?\)/g, '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/`[^`]*`/g, '')
    .trim();

  const words = plainText.split(/\s+/).filter(word => word.length > 0);
  const wordCount = words.length;
  const charCount = plainText.length;
  const readingTime = Math.ceil(wordCount / 225);
  const paragraphs = content.split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

  return {
    wordCount,
    charCount,
    readingTime: Math.max(1, readingTime),
    paragraphs
  };
}

export function summarizeContent(content: string, length: SummaryLength = 'medium', format: SummaryFormat = 'paragraph'): string {
  if (!content) return "Not enough content to summarize.";

  const sentences = content.match(/[^.!?\n]+[.!?\n]+/g) || [];
  if (sentences.length === 0) {
    return content.length > 250 ? content.substring(0, 250) + '...' : content;
  }

  let count = 3;
  if (length === 'short') count = 1;
  if (length === 'long') count = 6;

  const selectedSentences = sentences.slice(0, count).map(s => s.trim());

  if (format === 'bullets') {
    return selectedSentences.map(s => `- ${s}`).join('\n');
  }

  return selectedSentences.join(' ');
}

export function escapeHTML(str: string): string {
  const table: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (tag) => table[tag] || tag);
}
