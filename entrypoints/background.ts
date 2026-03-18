import keyword_extractor from 'keyword-extractor';
import { pdf } from 'pdf-parse';
import {
  calculateContentStats,
  summarizeContent,
  escapeHTML,
  type SummaryLength,
  type SummaryFormat
} from '../utils/content';

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
        const keywords = keyword_extractor.extract(content || '', {
          language: 'english',
          remove_digits: true,
          return_changed_case: true,
          remove_duplicates: true,
        });
        const result = keywords.join(', ');
        const historyItem: HistoryItem = { type: 'keywords', title, result, timestamp: Date.now() };
        chrome.storage.local.get({ history: [] }, (res) => {
          chrome.storage.local.set({ history: [historyItem, ...res.history] });
        });
        sendResponse({ result });
      }
    } else if (request.action === 'parsePdf') {
      try {
        const buffer = Buffer.from(request.pdfData.split(',')[1], 'base64');
        const data = await pdf(buffer);
        sendResponse({ text: data.text });
      } catch (error: any) {
        console.error('Error parsing PDF:', error);
        sendResponse({ error: `Failed to parse PDF: ${error.message}` });
      }
    } else if (request.action === 'startCrawl') {
      const { startUrl, depth, stayOnDomain } = request;
      crawl(startUrl, depth, stayOnDomain);
      sendResponse({ result: 'Crawl started.' });
    }
    return true;
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
