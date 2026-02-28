import { performance } from 'perf_hooks';

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

const SENTENCE_TOKENIZER_REGEX = /[^.!?\n]+[.!?\n]+/g;

// Original function
function summarizeContentOld(content: string, sentenceCount = 3): string {
  if (!content) return 'Not enough content to summarize.';

  const sentences = content.match(SENTENCE_TOKENIZER_REGEX) || [];

  if (sentences.length === 0) {
     return content.length > 300 ? content.substring(0, 300) + '...' : content;
  }

  if (sentences.length <= sentenceCount) {
    return content;
  }

  const wordFreq: Record<string, number> = {};
  const words = content.toLowerCase().match(/\b\w+\b/g) || [];

  words.forEach(word => {
    if (!STOP_WORDS.has(word) && word.length > 2) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const sentenceScores = sentences.map((sentence, index) => {
    const sentenceWords = sentence.toLowerCase().match(/\b\w+\b/g) || [];
    let score = 0;
    sentenceWords.forEach(word => {
      if (wordFreq[word]) {
        score += wordFreq[word];
      }
    });

    if (sentenceWords.length > 0) {
        score = score / Math.pow(sentenceWords.length, 0.5);
    }

    return { sentence, score, index };
  });

  sentenceScores.sort((a, b) => b.score - a.score);
  const topSentences = sentenceScores.slice(0, sentenceCount);
  topSentences.sort((a, b) => a.index - b.index);

  return topSentences.map(s => s.sentence.trim()).join(' ');
}

// Optimized function
const WORD_REGEX = /\b\w+\b/g;

function summarizeContentOptimized(content: string, sentenceCount = 3): string {
  if (!content) return 'Not enough content to summarize.';

  const sentences = content.match(SENTENCE_TOKENIZER_REGEX) || [];

  if (sentences.length === 0) {
     return content.length > 300 ? content.substring(0, 300) + '...' : content;
  }

  if (sentences.length <= sentenceCount) {
    return content;
  }

  const wordFreq: Record<string, number> = {};
  const words = content.toLowerCase().match(WORD_REGEX) || [];

  words.forEach(word => {
    if (!STOP_WORDS.has(word) && word.length > 2) {
      wordFreq[word] = (wordFreq[word] || 0) + 1;
    }
  });

  const sentenceScores = sentences.map((sentence, index) => {
    const sentenceWords = sentence.toLowerCase().match(WORD_REGEX) || [];
    let score = 0;
    sentenceWords.forEach(word => {
      if (wordFreq[word]) {
        score += wordFreq[word];
      }
    });

    if (sentenceWords.length > 0) {
        score = score / Math.pow(sentenceWords.length, 0.5);
    }

    return { sentence, score, index };
  });

  sentenceScores.sort((a, b) => b.score - a.score);
  const topSentences = sentenceScores.slice(0, sentenceCount);
  topSentences.sort((a, b) => a.index - b.index);

  return topSentences.map(s => s.sentence.trim()).join(' ');
}

// Generate large sample content
const sentence = 'This is a sample sentence with some words to test the performance of the regex matching. ';
const sampleContent = sentence.repeat(500);

console.log('Starting benchmark...');

const iterations = 100;

const startOld = performance.now();
for (let i = 0; i < iterations; i++) {
  summarizeContentOld(sampleContent);
}
const endOld = performance.now();

const startOptimized = performance.now();
for (let i = 0; i < iterations; i++) {
  summarizeContentOptimized(sampleContent);
}
const endOptimized = performance.now();

console.log('Old implementation: ' + (endOld - startOld).toFixed(2) + 'ms');
console.log('Optimized implementation: ' + (endOptimized - startOptimized).toFixed(2) + 'ms');
const improvement = ((1 - (endOptimized - startOptimized) / (endOld - startOld)) * 100).toFixed(2);
console.log('Improvement: ' + improvement + '%');
