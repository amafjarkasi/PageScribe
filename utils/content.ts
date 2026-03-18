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

export function summarizeContent(content: string, length: SummaryLength = 'medium', format: SummaryFormat = 'paragraph'): string {
  if (!content || content.trim().length < 50) return content || "Not enough content to summarize.";

  const sentences = content.match(/[^.!?\n]+[.!?\n]+/g) || [content];
  if (sentences.length <= 1) return content;

  const words = content.toLowerCase().match(/\b(\w+)\b/g) || [];
  const wordFreq: Record<string, number> = {};
  const stopwords = new Set(['the', 'a', 'and', 'is', 'in', 'it', 'you', 'that', 'he', 'was', 'for', 'on', 'are', 'as', 'with', 'his', 'they', 'i', 'at', 'be', 'this', 'have', 'from', 'or', 'one', 'had', 'by', 'word', 'but', 'not', 'what', 'all', 'were', 'we', 'when', 'your', 'can', 'said', 'there', 'use', 'an', 'each', 'which', 'she', 'do', 'how', 'their', 'if', 'will', 'up', 'other', 'about', 'out', 'many', 'then', 'them', 'these', 'so', 'some', 'her', 'would', 'make', 'like', 'him', 'into', 'time', 'has', 'look', 'two', 'more', 'write', 'go', 'see', 'number', 'no', 'way', 'could', 'my', 'than', 'first', 'water', 'been', 'call', 'who', 'oil', 'its', 'now', 'find', 'long', 'down', 'day', 'did', 'get', 'come', 'made', 'may', 'part']);

  words.forEach(word => {
    if (word.length > 3 && !stopwords.has(word)) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const sentenceScores = sentences.map((sentence, index) => {
    const sWords = sentence.toLowerCase().match(/\b(\w+)\b/g) || [];
    let score = 0;
    sWords.forEach(word => {
      if (wordFreq[word]) score += wordFreq[word];
    });
    const positionBias = Math.max(0, 1 - (index / sentences.length));
    score *= (1 + positionBias);
    return { sentence, score, index };
  });

  let count = 3;
  if (length === 'short') count = Math.max(1, Math.floor(sentences.length * 0.1));
  if (length === 'medium') count = Math.max(3, Math.floor(sentences.length * 0.2));
  if (length === 'long') count = Math.max(6, Math.floor(sentences.length * 0.4));
  count = Math.min(count, length === 'short' ? 2 : (length === 'medium' ? 5 : 10));

  const topSentences = sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .sort((a, b) => a.index - b.index)
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

// --- CONTENT INTELLIGENCE ---

export interface SentimentResult {
  score: number;
  comparative: number;
  type: 'positive' | 'neutral' | 'negative';
}

export function analyzeSentiment(text: string): SentimentResult {
  if (!text) return { score: 0, comparative: 0, type: 'neutral' };

  const positiveWords = new Set(['good', 'great', 'excellent', 'amazing', 'happy', 'love', 'wonderful', 'best', 'useful', 'easy', 'simple', 'reliable', 'efficient', 'fast', 'secure', 'solid', 'pro', 'effective', 'perfect', 'awesome', 'smart', 'clean', 'intuitive']);
  const negativeWords = new Set(['bad', 'poor', 'awful', 'terrible', 'sad', 'hate', 'worst', 'useless', 'hard', 'complex', 'broken', 'slow', 'vulnerable', 'clunky', 'ineffective', 'failing', 'buggy', 'error', 'wrong', 'horrible', 'mess', 'difficult']);

  const tokens = text.toLowerCase().match(/\b(\w+)\b/g) || [];
  let score = 0;

  tokens.forEach(token => {
    if (positiveWords.has(token)) score += 1;
    if (negativeWords.has(token)) score -= 1;
  });

  const comparative = tokens.length > 0 ? score / tokens.length : 0;
  let type: 'positive' | 'neutral' | 'negative' = 'neutral';
  if (score > 0) type = 'positive';
  if (score < 0) type = 'negative';

  return { score, comparative, type };
}

export interface ReadabilityResult {
  fleschEase: number;
  fleschKincaidGrade: number;
}

export function calculateReadability(text: string): ReadabilityResult {
  if (!text) return { fleschEase: 0, fleschKincaidGrade: 0 };

  const sentences = text.match(/[^.!?\n]+[.!?\n]+/g) || [text];
  const words = text.toLowerCase().match(/\b(\w+)\b/g) || [];

  if (sentences.length === 0 || words.length === 0) return { fleschEase: 0, fleschKincaidGrade: 0 };

  let syllables = 0;
  words.forEach(word => {
    const vowelMatches = word.match(/[aeiouy]+/g);
    syllables += vowelMatches ? vowelMatches.length : 1;
  });

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const fleschEase = 206.835 - (1.015 * avgSentenceLength) - (84.6 * avgSyllablesPerWord);
  const fleschKincaidGrade = (0.39 * avgSentenceLength) + (11.8 * avgSyllablesPerWord) - 15.59;

  return {
    fleschEase: Math.round(fleschEase * 100) / 100,
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 100) / 100
  };
}

export interface EntityExtractionResult {
  emails: string[];
  phoneNumbers: string[];
  urls: string[];
  dates: string[];
}

export function extractEntities(text: string): EntityExtractionResult {
  if (!text) return { emails: [], phoneNumbers: [], urls: [], dates: [] };

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
  const phoneRegex = /\b(?:\+?(\d{1,3}))?[-. (]*(\d{3})[-. )]*(\d{3})[-. ]*(\d{4})\b/g;
  const urlRegex = /\bhttps?:\/\/(?:www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g;
  const dateRegex = /\b(?:\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4})|(?:\d{4}[\/-]\d{1,2}[\/-]\d{1,2})\b/g;

  return {
    emails: [...new Set(text.match(emailRegex) || [])],
    phoneNumbers: [...new Set(text.match(phoneRegex) || [])],
    urls: [...new Set(text.match(urlRegex) || [])],
    dates: [...new Set(text.match(dateRegex) || [])],
  };
}

export interface TOCItem {
  level: number;
  text: string;
  id: string;
}

export function generateTableOfContents(markdown: string): TOCItem[] {
  if (!markdown) return [];

  const lines = markdown.split('\n');
  const toc: TOCItem[] = [];

  lines.forEach(line => {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^\w]+/g, '-');
      toc.push({ level, text, id });
    }
  });

  return toc;
}

// --- ADVANCED INTELLIGENCE ---

export function detectLanguage(text: string): string {
  if (!text) return 'Unknown';

  const lexicons: Record<string, string[]> = {
    'English': ['the', 'and', 'with', 'this', 'that', 'from'],
    'Spanish': ['el', 'la', 'con', 'este', 'esta', 'desde'],
    'French': ['le', 'la', 'avec', 'ceci', 'cela', 'depuis'],
    'German': ['der', 'die', 'und', 'mit', 'dies', 'dass'],
    'Italian': ['il', 'la', 'con', 'questo', 'quello', 'da']
  };

  const tokens = text.toLowerCase().match(/\b(\w+)\b/g) || [];
  const counts: Record<string, number> = {};

  Object.keys(lexicons).forEach(lang => {
    counts[lang] = 0;
    tokens.forEach(token => {
      if (lexicons[lang].includes(token)) counts[lang]++;
    });
  });

  const bestMatch = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return bestMatch[1] > 0 ? bestMatch[0] : 'English'; // Default to English
}

export interface WebMetadata {
  description?: string;
  author?: string;
  keywords?: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImage?: string;
  twitterCard?: string;
  schemaType?: string;
}

export function parseDOMMetadata(doc: Document): WebMetadata {
  const getMeta = (name: string) => doc.querySelector(`meta[name="${name}"], meta[property="${name}"]`)?.getAttribute('content');

  return {
    description: getMeta('description'),
    author: getMeta('author'),
    keywords: getMeta('keywords'),
    ogTitle: getMeta('og:title'),
    ogDescription: getMeta('og:description'),
    ogImage: getMeta('og:image'),
    twitterCard: getMeta('twitter:card'),
    schemaType: doc.querySelector('[type="application/ld+json"]')?.textContent?.match(/"@type":\s*"([^"]+)"/)?.[1]
  };
}
