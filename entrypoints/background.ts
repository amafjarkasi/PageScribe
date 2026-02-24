import keyword_extractor from 'keyword-extractor';
// We use dynamic import for pdfjs-dist to avoid build-time execution issues (DOMMatrix undefined)
// import * as pdfjsLib from 'pdfjs-dist';

// Worker URL import should be fine as it returns a string
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';


type SummaryLength = 'short' | 'medium' | 'long';
type SummaryFormat = 'paragraph' | 'bullets';

interface HistoryItem {
  type: 'keywords';
  title: string;
  result: string;
  timestamp: number;
}

interface ContentStats {
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
export function summarizeContent(content: string, sentenceCount = 3): string {
  if (!content) return "Not enough content to summarize.";

  // 1. Split into sentences (handling common delimiters)
  // This regex looks for sentence endings followed by whitespace or end of string
  const sentences = content.match(/[^.!?\n]+[.!?\n]+/g) || [];

  // Fallback if regex fails to split properly (e.g. no punctuation)
  if (sentences.length === 0) {
     return content.length > 300 ? content.substring(0, 300) + '...' : content;
  }

  if (sentences.length <= sentenceCount) {
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

  return topSentences.map(s => s.sentence.trim()).join(' ');
}

interface CrawledData {
  url: string;
  title: string;
  content: string;
}
function sendMessageToTab(tabId: number, message: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const maxRetries = 5;
    let retries = 0;

    function attemptSend() {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (chrome.runtime.lastError) {
          if (retries < maxRetries) {
            retries++;
            setTimeout(attemptSend, 200 * retries); // Exponential backoff
          } else {
            reject(new Error(chrome.runtime.lastError.message));
          }
        } else {
          resolve(response);
        }
      });
    }

    attemptSend();
  });
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[\\/:":*?<>|]/g, '_');
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Wrap async logic to use sendResponse asynchronously
    (async () => {
      try {
        if (request.action === 'processContent') {
          const { type, markdown, title, html, exportFormat } = request;

          if (type === 'save') {
            const safeTitle = sanitizeFilename(title);
            let fileContent: string;
            let mimeType: string;
            let fileExtension: string;

            if (exportFormat === 'html') {
              fileContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${title}</title></head><body><h1>${title}</h1>${html}</body></html>`;
              mimeType = 'text/html';
              fileExtension = 'html';
            } else {
              fileContent = markdown;
              mimeType = 'text/markdown';
              fileExtension = 'md';
            }

            const blob = new Blob([fileContent], { type: mimeType });
            const reader = new FileReader();
            reader.onload = () => {
              chrome.downloads.download({
                url: reader.result as string,
                filename: `${safeTitle}.${fileExtension}`,
                saveAs: true,
              });
            };
            reader.readAsDataURL(blob);
            sendResponse({ result: `Content saved as ${fileExtension.toUpperCase()} file.` });

          } else if (type === 'stats') {
            const stats = calculateContentStats(markdown);
            sendResponse({ result: `Word count: ${stats.wordCount}`, stats });

          } else if (type === 'preview') {
            const previewContent = exportFormat === 'html' ? html : markdown;
            sendResponse({ result: 'Preview ready', preview: previewContent });
          }
        } else if (request.action === 'parsePdf') {
          try {
            // Dynamic import for pdfjs-dist
            const pdfjsLib = await import('pdfjs-dist');
            // Set worker source
            pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

            // pdfjs-dist usage
            const base64Data = request.pdfData.split(',')[1];
            const binaryString = atob(base64Data);
            const len = binaryString.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            const loadingTask = pdfjsLib.getDocument({ data: bytes });
            const pdfDocument = await loadingTask.promise;

            let fullText = '';
            for (let i = 1; i <= pdfDocument.numPages; i++) {
                const page = await pdfDocument.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map((item: any) => item.str).join(' ');
                fullText += pageText + '\n\n';
            }

            sendResponse({ text: fullText });
          } catch (error: any) {
            console.error('Error parsing PDF:', error);
            sendResponse({ error: `Failed to parse PDF: ${error.message}` });
          }
        } else if (request.action === 'processText') {
          const { type, content, title, summaryLength, summaryFormat } = request;
          if (type === 'summarize') {
            // Adjust sentence count based on summaryLength
            let count = 3;
            if (summaryLength === 'short') count = 2;
            if (summaryLength === 'long') count = 7;

            const summary = summarizeContent(content, count);
            sendResponse({ result: summary });
          } else if (type === 'keywords') {
            const keywords = keyword_extractor.extract(content, {
              language: 'english',
              remove_digits: true,
              return_changed_case: true,
              remove_duplicates: true,
            });
            const result = keywords.join(', ');
            const historyItem: HistoryItem = { type: 'keywords', title, result, timestamp: Date.now() };
            chrome.storage.local.get({ history: [] }, (res) => {
              const history = (res.history as HistoryItem[]) || []; chrome.storage.local.set({ history: [historyItem, ...history] });
            });
            sendResponse({ result });

          } else if (type === 'stats') {
            const stats = calculateContentStats(content); // Use content for text stats
            const result = `Word count: ${stats.wordCount.toLocaleString()}, Reading time: ${stats.readingTime} minutes`;
            sendResponse({ result, stats });

          } else if (type === 'preview') {
            // For processText, preview just returns the text
            sendResponse({ result: 'Preview ready', preview: content });
          }
        } else if (request.action === 'startCrawl') {
          const { startUrl, depth, stayOnDomain } = request;
          crawl(startUrl, depth, stayOnDomain);
          sendResponse({ result: 'Crawl started.' });
        }
      } catch (e) {
        console.error("Background error:", e);
        sendResponse({ error: "An unexpected error occurred." });
      }
    })();
    return true; // Keep the message channel open for async response
  });
});

async function crawl(startUrl: string, depth: number, stayOnDomain: boolean) {
  await chrome.storage.local.set({ isCrawling: true });
  try {
    const queue: { url: string; level: number }[] = [{ url: startUrl, level: 0 }];
    const visited = new Set<string>();
    const crawledData: CrawledData[] = [];
    const startHostname = new URL(startUrl).hostname;

    while (queue.length > 0) {
      const { url, level } = queue.shift()!;

      if (level > depth || visited.has(url)) {
        continue;
      }

      visited.add(url);
      let tabId: number | undefined;

      try {
        // Create a new tab to extract content
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;

        if (tabId) {
          const response = await sendMessageToTab(tabId, {
            action: 'extractContent',
          });

          if (response && response.markdown) {
            crawledData.push({
              url: url,
              title: response.title,
              content: response.markdown,
            });

            // Find links for the next level
            if (level < depth) {
              const links: string[] = await sendMessageToTab(tabId, {
                action: 'extractLinks',
              });
              for (const link of links) {
                if (link) { // Ensure link is not null or empty
                  const linkUrl = new URL(link, url).href;
                  if (stayOnDomain && new URL(linkUrl).hostname !== startHostname) {
                    continue;
                  }
                  if (!visited.has(linkUrl)) {
                    queue.push({ url: linkUrl, level: level + 1 });
                  }
                }
              }
            }
          }
        }
      } catch (error) {
        console.error(`Failed to crawl ${url}:`, error);
      } finally {
        if (tabId) {
          await chrome.tabs.remove(tabId);
        }
      }
    }

    const jsonContent = JSON.stringify(crawledData, null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.downloads.download({
        url: reader.result as string,
        filename: 'crawled_content.json',
        saveAs: true,
      });
    };
    reader.readAsDataURL(blob);
  } finally {
    await chrome.storage.local.set({ isCrawling: false });
  }
}
