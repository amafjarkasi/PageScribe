import { escapeHTML } from '../utils/dom';
import { defineBackground } from 'wxt/utils/define-background';
import keyword_extractor from 'keyword-extractor';
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

const FILENAME_SANITIZE_REGEX = /[\\/:":*?<>|]/g;
const WORD_REGEX = /\b\w+\b/g;


function formatStatsResult(stats: ContentStats): string {
  return `Word count: ${stats.wordCount.toLocaleString()}, Reading time: ${stats.readingTime} minutes`;
}


function generateCSV(data: CrawledData[]): string {
  if (data.length === 0) return '';
  const escapeCsv = (str: string) => '"' + str.replace(/"/g, '""') + '"';
  const headers = ['URL', 'Title', 'Content Length'];
  const rows = data.map(row => [
    escapeCsv(row.url),
    escapeCsv(row.title),
    row.content.length.toString()
  ]);
  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}
interface CrawledData {
  url: string;
  title: string;
  author?: string;
  publishedTime?: string;
  siteName?: string;
  description?: string;
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
  return filename.replace(FILENAME_SANITIZE_REGEX, '_');
}

export default defineBackground(() => {
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    // Wrap async logic to use sendResponse asynchronously
    (async () => {
      try {
        if (request.action === 'processContent') {
          const { type, markdown, title, html, exportFormat, author, publishedTime, siteName, description } = request;

          if (type === 'save') {
            const safeTitle = sanitizeFilename(title);
            let fileContent: string;
            let mimeType: string;
            let fileExtension: string;


            const generateFrontmatter = () => {
              const lines = ['---', `title: "${title?.replace(/"/g, '\\"')}"`];
              if (author) lines.push(`author: "${author.replace(/"/g, '\\"')}"`);
              if (publishedTime) lines.push(`date: ${publishedTime}`);
              if (siteName) lines.push(`site: "${siteName.replace(/"/g, '\\"')}"`);
              if (description) lines.push(`description: "${description.replace(/"/g, '\\"')}"`);
              lines.push(`url: "${sender.tab?.url || ''}"`);
              lines.push('---', '');
              return lines.join('\n');
            };

            if (exportFormat === 'html') {
              fileContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><title>${escapeHTML(title)}</title></head><body><h1>${escapeHTML(title)}</h1>${html}</body></html>`;
              mimeType = 'text/html';
              fileExtension = 'html';
            } else {
              fileContent = generateFrontmatter() + '\n' + markdown;
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
          const { startUrl, depth, stayOnDomain, excludePattern } = request;
          crawl(startUrl, depth, stayOnDomain, excludePattern);
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

async function crawl(startUrl: string, depth: number, stayOnDomain: boolean, excludePattern?: string) {
  await chrome.storage.local.set({ isCrawling: true, crawlProgress: { visited: 0, queue: 1 } });
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
      await chrome.storage.local.set({ crawlProgress: { visited: visited.size, queue: queue.length } });
      let tabId: number | undefined;

      try {
        // Create a new tab to extract content
        const tab = await chrome.tabs.create({ url, active: false });
        tabId = tab.id;

        if (tabId) {
          const response = await sendMessageToTab(tabId, {
            action: 'extractContent',
            autoScroll: true,
          });

          if (response && response.markdown) {
            crawledData.push({
              url: url,
              title: response.title,
              author: response.author,
              publishedTime: response.publishedTime,
              siteName: response.siteName,
              description: response.description,
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
                  if (excludePattern && new RegExp(excludePattern, 'i').test(linkUrl)) {
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
    const jsonBlob = new Blob([jsonContent], { type: 'application/json' });
    const csvContent = generateCSV(crawledData);
    const csvBlob = new Blob([csvContent], { type: 'text/csv' });

    // Download CSV
    const csvReader = new FileReader();
    csvReader.onload = () => {
      chrome.downloads.download({
        url: csvReader.result as string,
        filename: 'crawled_content.csv',
        saveAs: true,
      });
    };
    csvReader.readAsDataURL(csvBlob);

    // Download JSON
    const blob = jsonBlob; // keep existing variable for the json download below
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
    await chrome.storage.local.set({ isCrawling: false, crawlProgress: null });
  }
}
