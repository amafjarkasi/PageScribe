import { escapeHTML } from '../utils/dom';
import { defineBackground } from 'wxt/utils/define-background';
import keyword_extractor from 'keyword-extractor';
import { pdf } from 'pdf-parse';
import {
  calculateContentStats,
  summarizeContent,
  escapeHTML,
  analyzeSentiment,
  calculateReadability,
  extractEntities,
  generateTableOfContents,
  type SummaryLength,
  type SummaryFormat
} from '../utils/content';
  type SummaryLength,
  type SummaryFormat
} from '../utils/content';
// We use dynamic import for pdfjs-dist to avoid build-time execution issues (DOMMatrix undefined)
// import * as pdfjsLib from 'pdfjs-dist';

// Worker URL import should be fine as it returns a string
// @ts-ignore
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.mjs?url';

import { summarizeContent, calculateContentStats, type SummaryLength, type SummaryFormat, type ContentStats } from '../utils/content';


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
const FILENAME_SANITIZE_REGEX = /[\\/:":*?<>|]/g;
const WORD_REGEX = /\b\w+\b/g;


function formatStatsResult(stats: ContentStats): string {
  return `Word count: ${stats.wordCount.toLocaleString()}, Reading time: ${stats.readingTime} minutes`;
}

interface CrawledData {
  url: string;
  title: string;
  content: string;
  summary?: string;
  metadata?: any;
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
  if (!filename) return 'download';
  return filename.replace(/[\\/:":*?<>|]/g, '_');
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.action === 'processContent' || request.action === 'processText') {
      const { type, title, summaryLength, summaryFormat, exportFormat } = request;
      const content = request.action === 'processContent' ? request.markdown : request.content;
      const html = request.html;

      if (type === 'save') {
        const safeTitle = sanitizeFilename(title);
        let fileContent: string;
        let mimeType: string;
        let fileExtension: string;

        if (exportFormat === 'html') {
          const escapedTitle = escapeHTML(title);
          fileContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapedTitle}</title></head><body><h1>${escapedTitle}</h1>${html}</body></html>`;
          mimeType = 'text/html';
          fileExtension = 'html';
        } else {
          fileContent = content;
          mimeType = 'text/markdown';
          fileExtension = 'md';
        }
  return filename.replace(FILENAME_SANITIZE_REGEX, '_');
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
              fileContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title></head><body><h1>${escapeHTML(title)}</h1>${html}</body></html>`;
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
            const result = formatStatsResult(stats);
            sendResponse({ result, stats });

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

      } else if (type === 'stats') {
        const stats = calculateContentStats(content);
        const result = `Word count: ${stats.wordCount.toLocaleString()}, Reading time: ${stats.readingTime} minutes`;
        sendResponse({ result, stats });

      } else if (type === 'preview') {
        const previewContent = exportFormat === 'html' ? html : content;
        sendResponse({ result: 'Preview ready', preview: previewContent });

      } else if (type === 'summarize') {
        const summary = summarizeContent(content, summaryLength, summaryFormat);
        sendResponse({ result: summary });

      } else if (type === 'keywords') {
        const rawKeywords = keyword_extractor.extract(content || '', {
          language: 'english',
          remove_digits: true,
          return_changed_case: true,
          remove_duplicates: false,
        });

        // Calculate keyword frequency for basic scoring
        const scores: Record<string, number> = {};
        rawKeywords.forEach(kw => {
          scores[kw] = (scores[kw] || 0) + 1;
        });

        });

        // Calculate keyword frequency for basic scoring
        const scores: Record<string, number> = {};
        rawKeywords.forEach(kw => {
          scores[kw] = (scores[kw] || 0) + 1;
        });

        const sortedKeywords = Object.entries(scores)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15);

        const result = sortedKeywords.map(([kw, score]) => `${kw} (${score})`).join(', ');
        const historyItem: HistoryItem = { type: 'keywords', title, result, timestamp: Date.now() };
        chrome.storage.local.get({ history: [] }, (res) => {
          chrome.storage.local.set({ history: [historyItem, ...res.history] });
        });
        sendResponse({ result });
      }
    } else if (request.action === 'analyze') {
      const { content, markdown } = request;
      const sentiment = analyzeSentiment(content);
      const readability = calculateReadability(content);
      const entities = extractEntities(content);
      const toc = generateTableOfContents(markdown);

      sendResponse({
        sentiment,
        readability,
        entities,
        toc
      });
    } else if (request.action === 'parsePdf') {
      try {
        const buffer = Buffer.from(request.pdfData.split(',')[1], 'base64');
        const data = await pdf(buffer);
        sendResponse({
          text: data.text,
          info: data.info,
          metadata: data.metadata,
          numpages: data.numpages,
        });
      } catch (error: any) {
        console.error('Error parsing PDF:', error);
        sendResponse({ error: `Failed to parse PDF: ${error.message}` });
      }
    } else if (request.action === 'startCrawl') {
      const { startUrl, depth, stayOnDomain, maxPages, excludePatterns, crawlDelay, exportFormat } = request;
      crawl(startUrl, depth, stayOnDomain, maxPages, excludePatterns, crawlDelay, exportFormat);
      sendResponse({ result: 'Crawl started.' });
    }
    return true;
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
            const summary = summarizeContent(content, summaryLength, summaryFormat);
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
            const result = formatStatsResult(stats);
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

async function crawl(
  startUrl: string,
  depth: number,
  stayOnDomain: boolean,
  maxPages: number = 50,
  excludePatterns: string = '',
  crawlDelay: number = 500,
  exportFormat: 'json' | 'csv' = 'json'
) {
  await chrome.storage.local.set({ isCrawling: true });
  try {
    const queue: { url: string; level: number }[] = [{ url: startUrl, level: 0 }];
    const visited = new Set<string>();
    const crawledData: CrawledData[] = [];
    const startHostname = new URL(startUrl).hostname;
    const excludes = excludePatterns ? excludePatterns.split(',').map(p => new RegExp(p.trim())) : [];

    while (queue.length > 0 && crawledData.length < maxPages) {
      const { url, level } = queue.shift()!;

      if (level > depth || visited.has(url)) {
        continue;
      }

      // Check exclusion patterns
      if (excludes.some(pattern => pattern.test(url))) {
        continue;
      }

      visited.add(url);
      let tabId: number | undefined;

      try {
        // Delay between requests
        if (crawledData.length > 0) {
          await new Promise(resolve => setTimeout(resolve, crawlDelay));
        }

        // Create a new tab to extract content
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;

        if (tabId) {
          const response = await sendMessageToTab(tabId, {
            action: 'extractContent',
          });

          if (response && response.markdown) {
            const summary = autoSummarize ? summarizeContent(response.markdown, 'short') : undefined;
            crawledData.push({
              url: url,
              title: response.title,
              content: response.markdown,
              summary: summary,
              metadata: response.metadata
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

    let fileContent: string;
    let mimeType: string;
    let fileName: string;

    if (exportFormat === 'csv') {
      const headers = ['URL', 'Title', 'Content'];
      const rows = crawledData.map(d => [
        `"${d.url.replace(/"/g, '""')}"`,
        `"${d.title.replace(/"/g, '""')}"`,
        `"${d.content.replace(/"/g, '""')}"`
      ].join(','));
      fileContent = [headers.join(','), ...rows].join('\n');
      mimeType = 'text/csv';
      fileName = 'crawled_content.csv';
    } else {
      fileContent = JSON.stringify(crawledData, null, 2);
      mimeType = 'application/json';
      fileName = 'crawled_content.json';
    }

    const blob = new Blob([fileContent], { type: mimeType });
    const reader = new FileReader();
    reader.onload = () => {
      chrome.downloads.download({
        url: reader.result as string,
        filename: fileName,
        saveAs: true,
      });
    };
    reader.readAsDataURL(blob);
  } finally {
    await chrome.storage.local.set({ isCrawling: false });
  }
}
