import keyword_extractor from 'keyword-extractor';

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
function calculateContentStats(content: string): ContentStats {
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

// Function to generate a simple summary
function summarizeContent(content: string, sentenceCount = 3): string {
  if (!content) {
    return "Not enough content to summarize.";
  }

  // A simple sentence tokenizer that handles various endings.
  const sentences = content.match(/[^.!?\n]+[.!?\n]+/g) || [];

  if (sentences.length === 0) {
    // Fallback for content without clear sentence endings
    return content.length > 250 ? content.substring(0, 250) + '...' : content;
  }

  const summary = sentences.slice(0, sentenceCount).join(' ').trim();

  return summary || "Could not generate a summary.";
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
    if (request.action === 'processContent') {
      const { type, markdown, title, content, html, exportFormat } = request;

      if (type === 'save') {
        const safeTitle = sanitizeFilename(title);
        let fileContent: string;
        let mimeType: string;
        let fileExtension: string;

        if (exportFormat === 'html') {
          // Create a complete HTML document
          fileContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 0 auto; padding: 20px; color: #333; }
        h1, h2, h3, h4, h5, h6 { margin-top: 24px; margin-bottom: 16px; font-weight: 600; line-height: 1.25; }
        h1 { font-size: 2em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        h2 { font-size: 1.5em; border-bottom: 1px solid #eaecef; padding-bottom: 0.3em; }
        p { margin-bottom: 16px; }
        img { max-width: 100%; height: auto; }
        pre { background-color: #f6f8fa; border-radius: 6px; padding: 16px; overflow: auto; }
        code { background-color: #f6f8fa; border-radius: 3px; padding: 0.2em 0.4em; }
        blockquote { border-left: 4px solid #dfe2e5; padding-left: 16px; margin-left: 0; color: #6a737d; }
    </style>
</head>
<body>
    <h1>${title}</h1>
    ${html}
</body>
</html>`;
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

      } else if (type === 'keywords') {
        const keywords = keyword_extractor.extract(content, {
          language: 'english',
          remove_digits: true,
          return_changed_case: true,
          remove_duplicates: true,
        });
        const result = keywords.join(', ');
        const historyItem: HistoryItem = {
          type: 'keywords',
          title,
          result,
          timestamp: Date.now(),
        };
        chrome.storage.local.get({ history: [] }, (res) => {
          const newHistory = [historyItem, ...res.history];
          chrome.storage.local.set({ history: newHistory });
        });
        sendResponse({ result });

      } else if (type === 'stats') {
        const stats = calculateContentStats(markdown);
        const result = `Word count: ${stats.wordCount.toLocaleString()}, Reading time: ${stats.readingTime} minutes`;
        sendResponse({ result, stats });

      } else if (type === 'preview') {
        let previewContent: string;
        if (exportFormat === 'html') {
          previewContent = html;
        } else {
          previewContent = markdown;
        }
        const result = `Content preview ready (${exportFormat.toUpperCase()} format)`;
        sendResponse({ result, preview: previewContent });

      } else if (type === 'summarize') {
        // Use the plain text content for summarization
        const summary = summarizeContent(content);
        sendResponse({ result: summary });
      }
    }
    else if (request.action === 'startCrawl') {
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