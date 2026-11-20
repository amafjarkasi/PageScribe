export type SummaryLength = 'short' | 'medium' | 'long';
export type SummaryFormat = 'paragraph' | 'bullets';

export interface ContentStats {
  wordCount: number;
  charCount: number;
  readingTime: number; // in minutes
  paragraphs: number;
}

const MARKDOWN_SYMBOLS_REGEX = /[#*_`~\[\]()]/g;
const IMAGES_REGEX = /!\[([^\]]*)\]\([^)]*\)/g;
const LINKS_REGEX = /\[([^\]]*)\]\([^)]*\)/g;
const WORDS_SPLIT_REGEX = /\s+/;
const PARAGRAPHS_SPLIT_REGEX = /\n\s*\n/;
const SENTENCE_TOKENIZER_REGEX = /[^.!?\n]+[.!?\n]+/g;

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
  'you', 'your', 'yours', 'yourself', 'yourselves',
]);

export function calculateContentStats(content: string): ContentStats {
  const safeContent = content || '';
  const plainText = safeContent
    .replace(IMAGES_REGEX, '$1')
    .replace(LINKS_REGEX, '$1')
    .replace(MARKDOWN_SYMBOLS_REGEX, '')
    .trim();

  const words = plainText ? plainText.split(WORDS_SPLIT_REGEX).filter((w) => w.length > 0) : [];
  const wordCount = words.length;
  const charCount = plainText.length;
  const readingTime = wordCount === 0 ? 0 : Math.max(1, Math.ceil(wordCount / 225));
  const paragraphs = safeContent
    .split(PARAGRAPHS_SPLIT_REGEX)
    .filter((p) => p.trim().length > 0).length;

  return {
    wordCount,
    charCount,
    readingTime,
    paragraphs,
  };
}

export function summarizeContent(
  content: string,
  length: SummaryLength | number = 'medium',
  format: SummaryFormat = 'paragraph'
): string {
  if (!content || !content.trim()) return 'Not enough content to summarize.';

  const sentences = content.match(SENTENCE_TOKENIZER_REGEX) || [];
  if (sentences.length === 0) {
    return content.length > 300 ? content.substring(0, 300) + '...' : content;
  }

  let targetCount: number;
  if (typeof length === 'number') {
    targetCount = Math.max(1, Math.floor(length));
  } else if (length === 'short') {
    targetCount = Math.min(2, Math.max(1, Math.floor(sentences.length * 0.25)));
  } else if (length === 'long') {
    targetCount = Math.min(7, Math.max(6, Math.floor(sentences.length * 0.5)));
  } else {
    targetCount = 3;
  }

  if (sentences.length <= targetCount) {
    if (format === 'bullets') {
      return sentences.map((s) => `- ${s.trim()}`).join('\n');
    }
    return sentences.map((s) => s.trim()).join(' ');
  }

  const wordFreq: Record<string, number> = {};
  const words = content.toLowerCase().match(/\b\w+\b/g) || [];
  for (const word of words) {
    if (!STOP_WORDS.has(word) && word.length > 2) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  }

  const sentenceScores = sentences.map((sentence, index) => {
    const sWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
    let score = 0;
    for (const word of sWords) {
      if (wordFreq[word]) score += wordFreq[word];
    }
    if (sWords.length > 0) {
      score = score / Math.pow(sWords.length, 0.5);
    }
    const positionBias = Math.max(0, 1 - index / sentences.length);
    score *= 1 + positionBias * 0.5;
    return { sentence, score, index };
  });

  const topSentences = sentenceScores
    .sort((a, b) => b.score - a.score)
    .slice(0, targetCount)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.sentence.trim());

  if (format === 'bullets') {
    return topSentences.map((s) => `- ${s}`).join('\n');
  }

  return topSentences.join(' ');
}


// --- CONTENT INTELLIGENCE ---

export interface SentimentResult {
  score: number;
  comparative: number;
  type: 'positive' | 'neutral' | 'negative';
}

const POSITIVE_WORDS = new Set([
  'good', 'great', 'excellent', 'amazing', 'happy', 'love', 'wonderful', 'best',
  'useful', 'easy', 'simple', 'reliable', 'efficient', 'fast', 'secure', 'solid',
  'pro', 'effective', 'perfect', 'awesome', 'smart', 'clean', 'intuitive',
]);

const NEGATIVE_WORDS = new Set([
  'bad', 'poor', 'awful', 'terrible', 'sad', 'hate', 'worst', 'useless', 'hard',
  'complex', 'broken', 'slow', 'vulnerable', 'clunky', 'ineffective', 'failing',
  'buggy', 'error', 'wrong', 'horrible', 'mess', 'difficult',
]);

export function analyzeSentiment(text: string): SentimentResult {
  if (!text) return { score: 0, comparative: 0, type: 'neutral' };

  const tokens = text.toLowerCase().match(/\b\w+\b/g) || [];
  let score = 0;

  for (const token of tokens) {
    if (POSITIVE_WORDS.has(token)) score += 1;
    if (NEGATIVE_WORDS.has(token)) score -= 1;
  }

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

  const sentences = text.match(SENTENCE_TOKENIZER_REGEX) || [text];
  const words = text.toLowerCase().match(/\b\w+\b/g) || [];

  if (sentences.length === 0 || words.length === 0) {
    return { fleschEase: 0, fleschKincaidGrade: 0 };
  }

  let syllables = 0;
  for (const word of words) {
    const vowelMatches = word.match(/[aeiouy]+/g);
    syllables += vowelMatches ? vowelMatches.length : 1;
  }

  const avgSentenceLength = words.length / sentences.length;
  const avgSyllablesPerWord = syllables / words.length;
  const fleschEase = 206.835 - 1.015 * avgSentenceLength - 84.6 * avgSyllablesPerWord;
  const fleschKincaidGrade = 0.39 * avgSentenceLength + 11.8 * avgSyllablesPerWord - 15.59;

  return {
    fleschEase: Math.round(fleschEase * 100) / 100,
    fleschKincaidGrade: Math.round(fleschKincaidGrade * 100) / 100,
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

  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
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

  for (const line of lines) {
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      const id = text.toLowerCase().replace(/[^\w]+/g, '-');
      toc.push({ level, text, id });
    }
  }

  return toc;
}

const LANGUAGE_STOPWORDS: Record<string, Set<string>> = {
  English: new Set(['the', 'and', 'is', 'in', 'to', 'of', 'a', 'for', 'on', 'with', 'over']),
  Spanish: new Set(['el', 'la', 'los', 'las', 'de', 'y', 'en', 'un', 'una', 'sobre', 'por']),
  French: new Set(['le', 'la', 'les', 'de', 'et', 'en', 'un', 'une', 'pour', 'sur', 'dans']),
  German: new Set(['der', 'die', 'das', 'und', 'in', 'zu', 'den', 'von', 'mit', 'auf']),
  Italian: new Set(['il', 'lo', 'la', 'i', 'gli', 'le', 'di', 'e', 'in', 'un', 'una', 'con']),
};

export function detectLanguage(text: string): string {
  if (!text) return 'English';
  const tokens = text.toLowerCase().match(/\b[a-záéíóúüñàèìòùâêîôûäöß]+\b/g) || [];
  if (tokens.length === 0) return 'English';

  let bestLang = 'English';
  let bestScore = 0;

  for (const [lang, stopSet] of Object.entries(LANGUAGE_STOPWORDS)) {
    let score = 0;
    for (const token of tokens) {
      if (stopSet.has(token)) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestLang = lang;
    }
  }

  return bestScore > 0 ? bestLang : 'English';
}
