export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryFormat = 'paragraph' | 'bullets';

export interface ContentStats {
  wordCount: number;
  charCount: number;
  readingTime: number; // in minutes
  paragraphs: number;
}

export function calculateContentStats(content: string): ContentStats {
  const plainText = (content || '')
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
  const paragraphs = (content || '').split(/\n\s*\n/).filter(p => p.trim().length > 0).length;

  return {
    wordCount,
    charCount,
    readingTime: Math.max(1, readingTime),
    paragraphs
  };
}

/**
 * A more advanced extractive summarizer using basic TF-IDF principles.
 * It scores sentences based on the importance of the words they contain.
 */
export function summarizeContent(content: string, length: SummaryLength = 'medium', format: SummaryFormat = 'paragraph'): string {
  if (!content || content.trim().length < 50) return content || "Not enough content to summarize.";

  const sentences = content.match(/[^.!?\n]+[.!?\n]+/g) || [content];
  if (sentences.length <= 1) return content;

  // 1. Tokenize and count word frequencies (TF)
  const words = content.toLowerCase().match(/\b(\w+)\b/g) || [];
  const wordFreq: Record<string, number> = {};
  const stopwords = new Set(['the', 'a', 'and', 'is', 'in', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'i', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part']);

  words.forEach(word => {
    if (word.length > 3 && !stopwords.has(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  // 2. Score sentences based on word frequency
  const sentenceScores = sentences.map((sentence, index) => {
    const sWords = sentence.toLowerCase().match(/\b(\w+)\b/g) || [];
    let score = 0;
    sWords.forEach(word => {
      if (wordFreq[word]) score += wordFreq[word];
    });

    // Position bias (sentences at the beginning are often more important)
    const positionBias = Math.max(0, 1 - (index / sentences.length));
    score *= (1 + positionBias);

    return { sentence, score, index };
  });

  // 3. Select top sentences
  let count = 3;
  if (length === 'short') count = Math.max(1, Math.floor(sentences.length * 0.1));
  if (length === 'medium') count = Math.max(3, Math.floor(sentences.length * 0.2));
  if (length === 'long') count = Math.max(6, Math.floor(sentences.length * 0.4));

  // Cap the count to something reasonable
  count = Math.min(count, length === 'short' ? 2 : (length === 'medium' ? 5 : 10));

  const topSentences = sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.index - b.index) // Restore original order
    .map(s => s.sentence.trim());

  if (format === 'bullets') {
    return topSentences.map(s => `- ${s}`).join('\n');
  }

  return topSentences.join(' ');
}

export function escapeHTML(str: string): string {
  if (!str) return '';
  const table: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (tag) => table[tag] || tag);
}
