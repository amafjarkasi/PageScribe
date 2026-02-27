export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryFormat = 'paragraph' | 'bullets';

export interface ContentStats {
  wordCount: number;
  charCount: number;
  readingTime: number; // in minutes
  paragraphs: number;
}

// Regular expressions moved to module scope for performance
const MARKDOWN_SYMBOLS_REGEX = /[#*_`~\[\]()]/g;
const IMAGES_REGEX = /!\[.*?\]\(.*?\)/g;
const LINKS_REGEX = /\[.*?\]\(.*?\)/g;
const CODE_BLOCKS_REGEX = /```[\s\S]*?```/g;
const INLINE_CODE_REGEX = /`[^`]*`/g;
const WORDS_SPLIT_REGEX = /\s+/;
const PARAGRAPHS_SPLIT_REGEX = /\n\s*\n/;
const SENTENCE_TOKENIZER_REGEX = /[^.!?\n]+[.!?\n]+/g;

// Function to calculate content statistics
export function calculateContentStats(content: string): ContentStats {
  // Remove markdown syntax for more accurate counting
  const plainText = content
    .replace(MARKDOWN_SYMBOLS_REGEX, '') // Remove markdown symbols
    .replace(IMAGES_REGEX, '') // Remove images
    .replace(LINKS_REGEX, '') // Remove links
    .replace(CODE_BLOCKS_REGEX, '') // Remove code blocks
    .replace(INLINE_CODE_REGEX, '') // Remove inline code
    .trim();

  const words = plainText.split(WORDS_SPLIT_REGEX).filter(word => word.length > 0);
  const wordCount = words.length;
  const charCount = plainText.length;

  // Average reading speed is 200-250 words per minute, we'll use 225
  const readingTime = Math.ceil(wordCount / 225);

  // Count paragraphs (split by double newlines)
  const paragraphs = content.split(PARAGRAPHS_SPLIT_REGEX).filter(p => p.trim().length > 0).length;

  return {
    wordCount,
    charCount,
    readingTime: Math.max(1, readingTime), // Minimum 1 minute
    paragraphs
  };
}

// Expanded stop words list for better summarization
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'as', 'at',
  'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'did', 'do', 'does', 'doing', 'don', 'down', 'during',
  'each', 'few', 'for', 'from', 'further',
  'had', 'has', 'have', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how',
  'i', 'if', 'in', 'into', 'is', 'it', 'its', 'itself',
  'just', 'me', 'more', 'most', 'my', 'myself',
  'no', 'nor', 'not', 'now',
  'of', 'off', 'on', 'once', 'only', 'or', 'other', 'our', 'ours', 'ourselves', 'out', 'over', 'own',
  's', 'same', 'she', 'should', 'so', 'some', 'such',
  't', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these', 'they', 'this', 'those', 'through', 'to', 'too',
  'under', 'until', 'up',
  'very',
  'was', 'we', 'were', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'will', 'with',
  'you', 'your', 'yours', 'yourself', 'yourselves'
]);

// Function to generate a smarter summary using sentence scoring
export function summarizeContent(content: string, length: SummaryLength | number = 'medium', format: SummaryFormat = 'paragraph'): string {
  if (!content) return "Not enough content to summarize.";

  let sentenceCount = 3;
  if (typeof length === 'number') {
    sentenceCount = length;
  } else {
    if (length === 'short') sentenceCount = 2;
    if (length === 'long') sentenceCount = 7;
  }

  // A simple sentence tokenizer that handles various endings.
  const sentences = content.match(SENTENCE_TOKENIZER_REGEX) || [];

  // Fallback if regex fails to split properly (e.g. no punctuation)
  if (sentences.length === 0) {
     return content.length > 300 ? content.substring(0, 300) + '...' : content;
  }

  if (sentences.length <= sentenceCount) {
    if (format === 'bullets') {
        return sentences.map(s => `- ${s.trim()}`).join('\n');
    }
    return content;
  }

  // 2. Tokenize and calculate word frequencies
  const wordFreq: Record<string, number> = {};
  const words = content.toLowerCase().match(/\b\w+\b/g) || [];

  words.forEach(word => {
    if (!STOP_WORDS.has(word) && word.length > 2) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  // 3. Score sentences based on word importance
  const sentenceScores = sentences.map((sentence, index) => {
    const sentenceWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
    let score = 0;
    sentenceWords.forEach(word => {
      if (wordFreq[word]) {
        score += wordFreq[word];
      }
    });

    // Normalize by length (square root) to favor informative but not excessively long sentences
    if (sentenceWords.length > 0) {
        score = score / Math.pow(sentenceWords.length, 0.5);
    }

    return { sentence, score, index };
  });

  // 4. Sort by score (descending) and pick top N
  sentenceScores.sort((a, b) => b.score - a.score);
  const topSentences = sentenceScores.slice(0, sentenceCount);

  // 5. Reorder by original index to maintain flow
  topSentences.sort((a, b) => a.index - b.index);

  if (format === 'bullets') {
    return topSentences.map(s => `- ${s.sentence.trim()}`).join('\n');
  }

  return topSentences.map(s => s.sentence.trim()).join(' ');
}
