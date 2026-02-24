import os

background_ts = r"""import keyword_extractor from 'keyword-extractor';
import * as pdfjsLib from 'pdfjs-dist';

// Worker configuration for pdfjs-dist
// In a Chrome Extension environment, we need to point to the worker script.
// Using the CDN for simplicity in this specific environment, or we rely on the bundler.
// Since we can't easily reference the worker file in the bundle without build config changes,
// We will try to rely on the build system handling the worker import or use a workaround.
// For now, let's try the standard import and see if Vite handles it.
// If not, we might need to bundle the worker.
// To be safe in a background script without DOM, we define GlobalWorkerOptions.
// However, 'pdfjs-dist/build/pdf.worker.mjs' import might fail if not handled by Vite.
// Let's assume the user has a setup or we use the non-worker loading if possible (deprecated).
// Actually, let's just use the main library and polyfill functionality.
// To avoid worker issues in this specific "fix" pass without changing build config too much:
// We can use a data-uri worker or similar, but let's try just standard usage first.

// NOTE: We need to set up the worker.
// import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
// pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;
// The ?url suffix is a Vite feature. Since this project uses WXT (which uses Vite), this should work.

// However, to be safe with TypeScript imports:
// @ts-ignore
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;


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
            const summary = summarizeContent(content, summaryLength === 'medium' ? 3 : (summaryLength === 'short' ? 1 : 5)); // Basic mapping
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
              chrome.storage.local.set({ history: [historyItem, ...res.history] });
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
"""

with open("entrypoints/background.ts", "w") as f:
    f.write(background_ts)


app_tsx = r"""import { useState, useEffect } from 'react';
import './App.css';

type Action = 'save' | 'keywords' | 'stats' | 'preview' | 'summarize';
type ExportFormat = 'markdown' | 'html';
type ActiveTab = 'page' | 'pdf' | 'crawl' | 'history';
type SummaryLength = 'short' | 'medium' | 'long';
type SummaryFormat = 'paragraph' | 'bullets';
type PdfAction = 'summarize' | 'keywords'; // Defined PdfAction

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

const TabButton = ({ tab, activeTab, onClick, children }: { tab: ActiveTab, activeTab: ActiveTab, onClick: (tab: ActiveTab) => void, children: React.ReactNode }) => (
  <button onClick={() => onClick(tab)} className={activeTab === tab ? 'active' : ''}>
    {children}
  </button>
);

const ProcessIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M4 20h2"/><path d="M6 14h12"/><path d="M18 14h2"/><path d="M4 14h2"/><path d="M12 8h9"/><path d="M4 8h2"/><path d="M6 4h12"/><path d="M18 4h2"/><path d="M4 4h2"/></svg>;
const PdfIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
const CrawlIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M12 2v20"/><circle cx="12" cy="12" r="4"/></svg>;
const HistoryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>;
const ThemeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;

function App() {
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [action, setAction] = useState<Action>('save');
  const [loading, setLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlDepth, setCrawlDepth] = useState(1);
  const [stayOnDomain, setStayOnDomain] = useState(true);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('page');
  const [contentStats, setContentStats] = useState<ContentStats | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('markdown');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>('');
  const [summaryLength, setSummaryLength] = useState<SummaryLength>('medium');
  const [summaryFormat, setSummaryFormat] = useState<SummaryFormat>('paragraph');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [processedText, setProcessedText] = useState<string>('');
  const [processedTitle, setProcessedTitle] = useState<string>('');
  const [pdfAction, setPdfAction] = useState<PdfAction>('summarize');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPdfFile(e.target.files[0]);
      setProcessedTitle(e.target.files[0].name);
    }
  };

  useEffect(() => {
    // Listener for history and crawling state changes
    const stateListener = (changes: { [key: string]: chrome.storage.StorageChange }, areaName: string) => {
      if (areaName !== 'local') return;
      if (changes.history) {
        setHistory(changes.history.newValue || []);
      }
      if (changes.isCrawling) {
        setIsCrawling(changes.isCrawling.newValue || false);
        if (changes.isCrawling.newValue) {
          setStatus('Crawling in progress...');
        } else {
          setStatus('Crawl finished.');
        }
      }
    };
    chrome.storage.onChanged.addListener(stateListener);

    // Initial state load
    chrome.storage.local.get({ history: [], isCrawling: false, isDarkMode: false }, (res) => {
      setHistory(res.history);
      setIsCrawling(res.isCrawling);
      setIsDarkMode(res.isDarkMode);
      if (res.isCrawling) {
        setStatus('Crawling in progress...');
      }
    });

    return () => {
      chrome.storage.onChanged.removeListener(stateListener);
    };
  }, []);

  const handlePageAction = async () => {
    setLoading(true);
    setStatus(`Performing action: ${action}...`);
    setResult('');
    setContentStats(null);
    setPreviewContent('');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });

        const processResponse = await chrome.runtime.sendMessage({
          action: 'processContent',
          type: action,
          title: response.title,
          markdown: response.markdown,
          html: response.html,
          exportFormat: exportFormat,
        });

        if (processResponse?.result) {
          setResult(processResponse.result);
          setStatus('Action completed successfully!');
          if (processResponse.stats) setContentStats(processResponse.stats);
          if (processResponse.preview) setPreviewContent(processResponse.preview);
        } else {
          setStatus('Failed to process content.');
        }
      }
    } catch (error: unknown) {
      console.error('Error processing page action:', error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  const handlePdfUpload = async () => {
    if (!pdfFile) {
      setStatus('Please select a PDF file.');
      return;
    }

    setLoading(true);
    setStatus('Processing PDF...');
    setResult('');
    setContentStats(null);
    setPreviewContent('');
    setProcessedText(''); // Clear previous PDF text

    const reader = new FileReader();
    reader.readAsDataURL(pdfFile);
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const response = await chrome.runtime.sendMessage({
          action: 'parsePdf',
          pdfData: base64Data,
        });

        if (response?.text) {
          setProcessedText(response.text);
          setStatus('PDF processed successfully! You can now choose an action below.');
        } else {
          setStatus(response?.error || 'Failed to process PDF.');
        }
      } catch (error: unknown) {
        console.error('Error processing PDF:', error);
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Error: ${message}`);
      } finally {
        setLoading(false);
      }
    };
  };

  const handlePdfAction = async () => {
     if (!processedText) {
       setStatus('No PDF content processed yet.');
       return;
     }

     setLoading(true);
     setStatus(`Performing action: ${pdfAction}...`);
     setResult('');

     try {
       const response = await chrome.runtime.sendMessage({
         action: 'processText',
         type: pdfAction,
         content: processedText,
         title: processedTitle,
         summaryLength: summaryLength,
         summaryFormat: summaryFormat,
       });

       if (response?.result) {
         setResult(response.result);
         setStatus('Action completed successfully!');
         if (response.stats) setContentStats(response.stats);
       } else {
         setStatus('Failed to process PDF content.');
       }
     } catch (error: unknown) {
       console.error('Error processing PDF action:', error);
       const message = error instanceof Error ? error.message : String(error);
       setStatus(`Error: ${message}`);
     } finally {
       setLoading(false);
     }
  };

  const startCrawl = async () => {
    setStatus('Starting crawl...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id && tab.url) {
        await chrome.runtime.sendMessage({
          action: 'startCrawl',
          startUrl: tab.url,
          depth: crawlDepth,
          stayOnDomain: stayOnDomain,
        });
        // No need to set status here, the storage listener will do it
      }
    } catch (error: unknown) {
      console.error('Error starting crawl:', error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${message}`);
    }
  };

  const clearHistory = () => {
    chrome.storage.local.set({ history: [] });
  };

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    chrome.storage.local.set({ isDarkMode: newTheme });
  };

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : ''}`}>
      <header>
        <div className="header-content">
          <h1>PageScribe</h1>
          <button className="theme-toggle" onClick={toggleTheme} title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}>
            <ThemeIcon />
          </button>
        </div>
      </header>
      <nav>
        <TabButton tab="page" activeTab={activeTab} onClick={setActiveTab}><ProcessIcon /><span>Process Page</span></TabButton>
        <TabButton tab="pdf" activeTab={activeTab} onClick={setActiveTab}><PdfIcon /><span>Process PDF</span></TabButton>
        <TabButton tab="crawl" activeTab={activeTab} onClick={setActiveTab}><CrawlIcon /><span>Crawl</span></TabButton>
        <TabButton tab="history" activeTab={activeTab} onClick={setActiveTab}><HistoryIcon /><span>History</span></TabButton>
      </nav>
      <main>
        <div className={`tab-content ${activeTab === 'page' ? 'active' : ''}`}>
          <div className="form-group">
            <label htmlFor="action-select">Action</label>
            <select id="action-select" value={action} onChange={(e) => setAction(e.target.value as Action)}>
              <option value="save">Save Full Content</option>
              <option value="preview">Preview Content</option>
              <option value="keywords">Extract Keywords</option>
              <option value="stats">Get Statistics</option>
              <option value="summarize">Summarize</option>
            </select>
          </div>
          {action === 'summarize' && (
            <>
              <div className="form-group">
                <label htmlFor="summary-length">Summary Length</label>
                <select id="summary-length" value={summaryLength} onChange={(e) => setSummaryLength(e.target.value as SummaryLength)}>
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="summary-format">Summary Format</label>
                <select id="summary-format" value={summaryFormat} onChange={(e) => setSummaryFormat(e.target.value as SummaryFormat)}>
                  <option value="paragraph">Paragraph</option>
                  <option value="bullets">Bullet Points</option>
                </select>
              </div>
            </>
          )}
          {(action === 'save' || action === 'preview') && (
            <div className="form-group">
              <label htmlFor="export-format">Export Format</label>
              <select id="export-format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)}>
                <option value="markdown">Markdown (.md)</option>
                <option value="html">HTML (.html)</option>
              </select>
            </div>
          )}
          <button className="primary-button" onClick={handlePageAction} disabled={loading || isCrawling}>
            {loading ? 'Processing...' : 'Go'}
          </button>
        </div>

        <div className={`tab-content ${activeTab === 'pdf' ? 'active' : ''}`}>
          {!processedText ? (
            <>
              <div className="form-group">
                <label htmlFor="pdf-upload">Upload PDF</label>
                <input type="file" id="pdf-upload" accept="application/pdf" onChange={handleFileChange} />
              </div>
              <button className="primary-button" onClick={handlePdfUpload} disabled={loading || !pdfFile}>
                {loading ? 'Processing...' : 'Process PDF'}
              </button>
            </>
          ) : (
            <>
              <div className="form-group">
                <label htmlFor="pdf-action-select">Action</label>
                <select id="pdf-action-select" value={pdfAction} onChange={(e) => setPdfAction(e.target.value as PdfAction)}>
                  <option value="summarize">Summarize</option>
                  <option value="keywords">Extract Keywords</option>
                </select>
              </div>
              {pdfAction === 'summarize' && (
                <>
                  <div className="form-group">
                    <label htmlFor="summary-length-pdf">Summary Length</label>
                    <select id="summary-length-pdf" value={summaryLength} onChange={(e) => setSummaryLength(e.target.value as SummaryLength)}>
                      <option value="short">Short</option>
                      <option value="medium">Medium</option>
                      <option value="long">Long</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label htmlFor="summary-format-pdf">Summary Format</label>
                    <select id="summary-format-pdf" value={summaryFormat} onChange={(e) => setSummaryFormat(e.target.value as SummaryFormat)}>
                      <option value="paragraph">Paragraph</option>
                      <option value="bullets">Bullet Points</option>
                    </select>
                  </div>
                </>
              )}
              <button className="primary-button" onClick={handlePdfAction} disabled={loading}>
                {loading ? 'Processing...' : 'Go'}
              </button>
              <button className="secondary-button" onClick={() => setProcessedText('')} style={{marginTop: '10px'}}>
                Process another PDF
              </button>
            </>
          )}
        </div>

        {(activeTab === 'page' || activeTab === 'pdf') && (
          <div className="results-container">
            {status && <p className="status">{status}</p>}
            {result && (
              <div className="result-box">
                <h4>Result:</h4>
                <p>{result}</p>
              </div>
            )}
            {contentStats && (
              <div className="stats-box">
                <h4>Content Statistics:</h4>
                <div className="stats-grid">
                  <div className="stat-item">
                    <span className="stat-label">Words:</span>
                    <span className="stat-value">{contentStats.wordCount.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Characters:</span>
                    <span className="stat-value">{contentStats.charCount.toLocaleString()}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Reading Time:</span>
                    <span className="stat-value">{contentStats.readingTime} min</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Paragraphs:</span>
                    <span className="stat-value">{contentStats.paragraphs}</span>
                  </div>
                </div>
              </div>
            )}
            {previewContent && (
              <div className="preview-box">
                <h4>Content Preview:</h4>
                <div className="preview-content">
                  {exportFormat === 'html' ? (
                    <div dangerouslySetInnerHTML={{ __html: previewContent }} />
                  ) : (
                    <pre>{previewContent}</pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`tab-content ${activeTab === 'crawl' ? 'active' : ''}`}>
          <div className="form-group">
            <label htmlFor="crawl-depth">Crawl Depth</label>
            <input type="number" id="crawl-depth" value={crawlDepth} onChange={(e) => setCrawlDepth(parseInt(e.target.value, 10))} min="1" />
          </div>
          <div className="checkbox-group">
            <input type="checkbox" id="stay-on-domain" checked={stayOnDomain} onChange={(e) => setStayOnDomain(e.target.checked)} />
            <label htmlFor="stay-on-domain">Stay on domain</label>
          </div>
          <button className="primary-button" onClick={startCrawl} disabled={isCrawling}>
            {isCrawling ? 'Crawling...' : 'Start Crawl'}
          </button>
        </div>

        <div className={`tab-content ${activeTab === 'history' ? 'active' : ''}`}>
          <div className="history-header">
            <h3>History</h3>
            <button className="secondary-button" onClick={clearHistory}>Clear</button>
          </div>
          <div className="history-list">
            {history.length > 0 ? (
              history.map((item) => (
                <div key={item.timestamp} className="history-item">
                  <h4>{item.title}</h4>
                  <p><strong>{item.type}:</strong> {item.result}</p>
                  <small>{new Date(item.timestamp).toLocaleString()}</small>
                </div>
              ))
            ) : (
              <p className="empty-history">No history yet.</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
