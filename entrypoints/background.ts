import { defineBackground } from 'wxt/utils/define-background';
import keyword_extractor from 'keyword-extractor';
import { escapeHTML } from '../utils/dom';
import {
  calculateContentStats,
  summarizeContent,
  analyzeSentiment,
  calculateReadability,
  extractEntities,
  generateTableOfContents,
  detectLanguage,
  type SummaryLength,
  type SummaryFormat,
  type ContentStats,
} from '../utils/content';
import {
  fetchRobotsRules,
  isUrlAllowedByRobots,
  type RobotsRule,
} from '../utils/robots';
import {
  DEFAULT_AI_CONFIG,
  summarizeWithAI,
  askWithAI,
  type AIConfig,
} from '../utils/llm';
import {
  BUILTIN_TEMPLATES,
  renderTemplate,
  type ClipTemplate,
} from '../utils/templates';
import {
  formatHighlightsMarkdown,
  normalizeHighlightUrl,
  type PageHighlight,
} from '../utils/highlights';

interface HistoryItem {
  type: 'keywords' | 'summarize' | 'qa';
  title: string;
  result: string;
  timestamp: number;
}

export interface CrawledData {
  url: string;
  title: string;
  author?: string;
  publishedTime?: string;
  siteName?: string;
  description?: string;
  content: string;
  wordCount: number;
  summary?: string;
  metadata?: Record<string, unknown>;
}

export interface CrawlLogEntry {
  url: string;
  title?: string;
  status: 'success' | 'failed' | 'skipped';
  reason?: string;
  wordCount?: number;
  timestamp: number;
}

const FILENAME_SANITIZE_REGEX = /[\\/:*?"<>|]/g;
const MAX_HISTORY_ITEMS = 100;
const OFFSCREEN_DOCUMENT_PATH = 'offscreen.html';
let crawlAbortRequested = false;
let creatingOffscreen: Promise<void> | null = null;

function sanitizeFilename(filename: string): string {
  if (!filename) return 'download';
  const cleaned = filename.replace(FILENAME_SANITIZE_REGEX, '_').trim();
  return cleaned.slice(0, 120) || 'download';
}

function formatStatsResult(stats: ContentStats): string {
  return `Word count: ${stats.wordCount.toLocaleString()}, Reading time: ${stats.readingTime} minutes`;
}

function stringToDataUrl(content: string, mimeType: string): string {
  const bytes = new TextEncoder().encode(content);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return `data:${mimeType};charset=utf-8;base64,${btoa(binary)}`;
}

function generateFrontmatter(fields: {
  title?: string;
  author?: string;
  publishedTime?: string;
  siteName?: string;
  description?: string;
  url?: string;
}): string {
  const esc = (val: string) => val.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  const lines = ['---', `title: "${esc(fields.title || 'Untitled')}"`];
  if (fields.author) lines.push(`author: "${esc(fields.author)}"`);
  if (fields.publishedTime) lines.push(`date: "${esc(fields.publishedTime)}"`);
  if (fields.siteName) lines.push(`site: "${esc(fields.siteName)}"`);
  if (fields.description) lines.push(`description: "${esc(fields.description)}"`);
  if (fields.url) lines.push(`url: "${esc(fields.url)}"`);
  lines.push('---', '');
  return lines.join('\n');
}

function generateCSV(data: CrawledData[]): string {
  const escapeCsv = (str: string) => '"' + (str || '').replace(/"/g, '""') + '"';
  const headers = ['URL', 'Title', 'Author', 'Published', 'Word Count', 'Summary', 'Content'];
  const rows = data.map((row) => [
    escapeCsv(row.url),
    escapeCsv(row.title),
    escapeCsv(row.author || ''),
    escapeCsv(row.publishedTime || ''),
    String(row.wordCount ?? row.content?.length ?? 0),
    escapeCsv(row.summary || ''),
    escapeCsv(row.content),
  ]);
  return [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
}

async function appendHistory(item: HistoryItem): Promise<void> {
  try {
    const res = await chrome.storage.local.get({ history: [] });
    const history = Array.isArray(res.history) ? (res.history as HistoryItem[]) : [];
    const updated = [item, ...history].slice(0, MAX_HISTORY_ITEMS);
    await chrome.storage.local.set({ history: updated });
  } catch (err) {
    console.warn('Failed to persist history item:', err);
  }
}

async function getAIConfig(): Promise<AIConfig> {
  try {
    const res = await chrome.storage.local.get({ aiConfig: DEFAULT_AI_CONFIG });
    return { ...DEFAULT_AI_CONFIG, ...(res.aiConfig as Partial<AIConfig>) };
  } catch {
    return DEFAULT_AI_CONFIG;
  }
}

function extractRankedKeywords(text: string, limit = 15): string {
  const rawKeywords = keyword_extractor.extract(text || '', {
    language: 'english',
    remove_digits: true,
    return_changed_case: true,
    remove_duplicates: false,
  });

  const scores: Record<string, number> = {};
  for (const kw of rawKeywords) {
    scores[kw] = (scores[kw] || 0) + 1;
  }

  return Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([kw, score]) => `${kw} (${score})`)
    .join(', ');
}

async function ensureOffscreenDocument(): Promise<void> {
  const offscreenUrl = chrome.runtime.getURL(OFFSCREEN_DOCUMENT_PATH);
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT' as chrome.runtime.ContextType],
    documentUrls: [offscreenUrl],
  });

  if (existingContexts.length > 0) return;

  if (creatingOffscreen) {
    await creatingOffscreen;
    return;
  }

  creatingOffscreen = chrome.offscreen.createDocument({
    url: OFFSCREEN_DOCUMENT_PATH,
    reasons: [chrome.offscreen.Reason.DOM_PARSER],
    justification: 'Parse PDF files with pdf.js outside the service worker.',
  });

  try {
    await creatingOffscreen;
  } finally {
    creatingOffscreen = null;
  }
}

function waitForTabLoad(tabId: number, timeoutMs = 15000): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;

    const cleanup = () => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      chrome.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
    };

    const onUpdated = (updatedTabId: number, changeInfo: { status?: string }) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete' && !settled) {
        settled = true;
        cleanup();
        resolve();
      }
    };

    const onRemoved = (removedTabId: number) => {
      if (removedTabId === tabId && !settled) {
        settled = true;
        cleanup();
        reject(new Error('Tab was closed before finishing load'));
      }
    };

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        cleanup();
        resolve();
      }
    }, timeoutMs);

    chrome.tabs.onUpdated.addListener(onUpdated);
    chrome.tabs.onRemoved.addListener(onRemoved);

    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        if (!settled) {
          settled = true;
          cleanup();
          reject(new Error(chrome.runtime.lastError.message));
        }
        return;
      }
      if (tab?.status === 'complete' && !settled) {
        settled = true;
        cleanup();
        resolve();
      }
    });
  });
}

async function sendMessageToTabWithFallback(
  tabId: number,
  message: Record<string, unknown>
): Promise<any> {
  const maxRetries = 4;
  let injected = false;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await new Promise((resolve, reject) => {
        chrome.tabs.sendMessage(tabId, message, (res) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(res);
          }
        });
      });
      return response;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (!injected && msg.includes('Receiving end does not exist')) {
        injected = true;
        try {
          await chrome.scripting.executeScript({
            target: { tabId },
            files: ['content-scripts/content.js'],
          });
          continue;
        } catch (injectErr) {
          throw injectErr;
        }
      }
      if (attempt === maxRetries) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

function compileExcludePatterns(patternsCsv: string): RegExp[] {
  if (!patternsCsv?.trim()) return [];
  const compiled: RegExp[] = [];
  for (const raw of patternsCsv.split(',')) {
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      compiled.push(new RegExp(trimmed, 'i'));
    } catch (err) {
      console.warn(`Ignoring invalid exclude regex "${trimmed}":`, err);
    }
  }
  return compiled;
}

function normalizeHttpUrl(rawUrl: string, baseUrl?: string): string | null {
  try {
    const parsed = baseUrl ? new URL(rawUrl, baseUrl) : new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    parsed.hash = '';
    return parsed.href;
  } catch {
    return null;
  }
}

function generateLlmsFullMarkdown(data: CrawledData[]): string {
  const indexLines = ['# Knowledge Pack (llms-full.md)', '', `Total pages: ${data.length}`, '', '## Index', ''];
  data.forEach((d, idx) => {
    indexLines.push(`${idx + 1}. [${d.title || d.url}](${d.url}) (${d.wordCount} words)`);
  });
  indexLines.push('', '---', '');

  const bodySections = data.map((d) => {
    const parts = [`## ${d.title || 'Untitled'}`, `Source: ${d.url}`];
    if (d.summary) parts.push('', `> **Summary:** ${d.summary}`);
    parts.push('', d.content || '', '', '---', '');
    return parts.join('\n');
  });

  return [...indexLines, ...bodySections].join('\n');
}

async function getHighlightsForUrl(url: string): Promise<PageHighlight[]> {
  const norm = normalizeHighlightUrl(url);
  if (!norm) return [];
  try {
    const res = await chrome.storage.local.get({ pageHighlights: [] });
    const all = (res.pageHighlights as PageHighlight[]) || [];
    return all.filter((h) => normalizeHighlightUrl(h.url) === norm);
  } catch {
    return [];
  }
}

async function buildTemplatedMarkdown(params: {
  title: string;
  url: string;
  author?: string;
  publishedTime?: string;
  siteName?: string;
  description?: string;
  content: string;
  templateId?: string;
  customTemplateBody?: string;
}): Promise<string> {
  const highlights = await getHighlightsForUrl(params.url);
  const highlightsMd = formatHighlightsMarkdown(highlights);

  if (!params.templateId && !params.customTemplateBody) {
    const frontmatter = generateFrontmatter({
      title: params.title,
      author: params.author,
      publishedTime: params.publishedTime,
      siteName: params.siteName,
      description: params.description,
      url: params.url,
    });
    const highlightSection = highlightsMd ? `\n## Highlights\n\n${highlightsMd}\n` : '';
    return `${frontmatter}${highlightSection}\n${params.content}`;
  }

  let templateBody = params.customTemplateBody || '';
  if (!templateBody) {
    const stored = await chrome.storage.local.get({ customTemplates: [] });
    const allTemplates = [
      ...BUILTIN_TEMPLATES,
      ...((stored.customTemplates as ClipTemplate[]) || []),
    ];
    const found = allTemplates.find((t) => t.id === params.templateId) || BUILTIN_TEMPLATES[0];
    templateBody = found.body;
  }

  const stats = calculateContentStats(params.content);
  const summary = templateBody.includes('{{summary}}')
    ? summarizeContent(params.content, 'short')
    : '';
  const keywords = templateBody.includes('{{keywords}}')
    ? extractRankedKeywords(params.content, 8)
    : '';

  return renderTemplate(templateBody, {
    title: params.title,
    url: params.url,
    author: params.author || '',
    date: params.publishedTime || '',
    site: params.siteName || '',
    description: params.description || '',
    language: detectLanguage(params.content),
    wordCount: stats.wordCount,
    readingTime: stats.readingTime,
    keywords,
    summary,
    highlights: highlightsMd,
    content: params.content,
  });
}

async function downloadCrawlData(data: CrawledData[], format: 'json' | 'csv' | 'llms'): Promise<void> {
  if (data.length === 0) return;
  let fileContent: string;
  let mimeType: string;
  let filename: string;

  if (format === 'csv') {
    fileContent = generateCSV(data);
    mimeType = 'text/csv';
    filename = 'crawled_content.csv';
  } else if (format === 'llms') {
    fileContent = generateLlmsFullMarkdown(data);
    mimeType = 'text/markdown';
    filename = 'llms-full.md';
  } else {
    fileContent = JSON.stringify(data, null, 2);
    mimeType = 'application/json';
    filename = 'crawled_content.json';
  }

  await chrome.downloads.download({
    url: stringToDataUrl(fileContent, mimeType),
    filename,
    saveAs: true,
  });
}

async function crawl(options: {
  startUrl: string;
  depth: number;
  stayOnDomain: boolean;
  maxPages: number;
  excludePatterns: string;
  crawlDelay: number;
  exportFormat: 'json' | 'csv' | 'llms';
  autoSummarize: boolean;
  autoScroll: boolean;
  respectRobots: boolean;
  concurrency: number;
}): Promise<void> {
  const normalizedStart = normalizeHttpUrl(options.startUrl);
  if (!normalizedStart) {
    await chrome.storage.local.set({ isCrawling: false, crawlProgress: null });
    return;
  }

  crawlAbortRequested = false;
  const maxDepth = Math.max(0, Math.min(10, Number(options.depth) || 1));
  const maxPages = Math.max(1, Math.min(500, Number(options.maxPages) || 20));
  const crawlDelay = Math.max(0, Number(options.crawlDelay) || 500);
  const concurrency = Math.max(1, Math.min(3, Number(options.concurrency) || 1));
  const excludes = compileExcludePatterns(options.excludePatterns);
  const startHostname = new URL(normalizedStart).hostname;

  const queue: { url: string; level: number }[] = [{ url: normalizedStart, level: 0 }];
  const visited = new Set<string>();
  const crawledData: CrawledData[] = [];
  const crawlLog: CrawlLogEntry[] = [];
  const robotsCache = new Map<string, Promise<RobotsRule>>();
  let activeWorkers = 0;

  const getRobots = (origin: string): Promise<RobotsRule> => {
    let cached = robotsCache.get(origin);
    if (!cached) {
      cached = fetchRobotsRules(origin);
      robotsCache.set(origin, cached);
    }
    return cached;
  };

  const syncProgress = async () => {
    await chrome.storage.local.set({
      crawlProgress: { visited: visited.size, queue: queue.length },
      crawlLog: crawlLog.slice(-100),
      crawlResults: crawledData,
    });
  };

  await chrome.storage.local.set({
    isCrawling: true,
    crawlProgress: { visited: 0, queue: 1 },
    crawlLog: [],
    crawlResults: [],
  });

  try {
    const worker = async () => {
      while (!crawlAbortRequested) {
        if (crawledData.length >= maxPages) break;

        const next = queue.shift();
        if (!next) {
          if (activeWorkers > 0) {
            await new Promise((r) => setTimeout(r, 150));
            continue;
          }
          break;
        }

        const { url, level } = next;
        if (level > maxDepth || visited.has(url)) continue;

        if (excludes.some((pattern) => pattern.test(url))) {
          visited.add(url);
          crawlLog.push({ url, status: 'skipped', reason: 'Excluded by regex', timestamp: Date.now() });
          await syncProgress();
          continue;
        }

        if (options.respectRobots) {
          const origin = new URL(url).origin;
          const rules = await getRobots(origin);
          if (!isUrlAllowedByRobots(url, rules)) {
            visited.add(url);
            crawlLog.push({ url, status: 'skipped', reason: 'Blocked by robots.txt', timestamp: Date.now() });
            await syncProgress();
            continue;
          }
        }

        visited.add(url);
        activeWorkers++;
        await syncProgress();

        let tabId: number | undefined;
        try {
          if (crawledData.length > 0 && crawlDelay > 0) {
            await new Promise((resolve) => setTimeout(resolve, crawlDelay));
          }
          if (crawlAbortRequested || crawledData.length >= maxPages) break;

          const tab = await chrome.tabs.create({ url, active: false });
          tabId = tab.id;

          if (tabId !== undefined) {
            await waitForTabLoad(tabId);
            if (crawlAbortRequested) break;

            const response = await sendMessageToTabWithFallback(tabId, {
              action: 'extractContent',
              autoScroll: options.autoScroll,
            });

            if (response && (response.markdown || response.content)) {
              const contentText = response.markdown || response.content || '';
              const stats = calculateContentStats(contentText);
              const summary = options.autoSummarize
                ? summarizeContent(contentText, 'short')
                : undefined;

              if (crawledData.length < maxPages) {
                crawledData.push({
                  url,
                  title: response.title || 'Untitled',
                  author: response.author,
                  publishedTime: response.publishedTime,
                  siteName: response.siteName,
                  description: response.description,
                  content: contentText,
                  wordCount: stats.wordCount,
                  summary,
                  metadata: response.metadata,
                });

                crawlLog.push({
                  url,
                  title: response.title || 'Untitled',
                  status: 'success',
                  wordCount: stats.wordCount,
                  timestamp: Date.now(),
                });
              }

              if (level < maxDepth && !crawlAbortRequested && crawledData.length < maxPages) {
                const links = (await sendMessageToTabWithFallback(tabId, {
                  action: 'extractLinks',
                })) as string[];

                if (Array.isArray(links)) {
                  for (const link of links) {
                    const normalized = normalizeHttpUrl(link, url);
                    if (!normalized) continue;
                    if (options.stayOnDomain && new URL(normalized).hostname !== startHostname) {
                      continue;
                    }
                    if (excludes.some((pattern) => pattern.test(normalized))) {
                      continue;
                    }
                    if (!visited.has(normalized) && !queue.some((q) => q.url === normalized)) {
                      queue.push({ url: normalized, level: level + 1 });
                    }
                  }
                }
              }
            } else {
              crawlLog.push({
                url,
                status: 'failed',
                reason: response?.error || 'Empty content',
                timestamp: Date.now(),
              });
            }
          }
        } catch (error) {
          console.error(`Failed to crawl ${url}:`, error);
          crawlLog.push({
            url,
            status: 'failed',
            reason: error instanceof Error ? error.message : String(error),
            timestamp: Date.now(),
          });
        } finally {
          activeWorkers--;
          if (tabId !== undefined) {
            try {
              await chrome.tabs.remove(tabId);
            } catch {
              // Tab may already be closed
            }
          }
          await syncProgress();
        }
      }
    };

    await Promise.all(Array.from({ length: concurrency }, () => worker()));

    if (crawledData.length > 0) {
      await downloadCrawlData(crawledData, options.exportFormat);
    }
  } finally {
    crawlAbortRequested = false;
    await chrome.storage.local.set({ isCrawling: false, crawlProgress: null });
  }
}

export default defineBackground(() => {
  const resetCrawlState = () => {
    chrome.storage.local.set({ isCrawling: false, crawlProgress: null }).catch(() => {});
  };

  chrome.runtime.onStartup.addListener(resetCrawlState);
  chrome.runtime.onInstalled.addListener(() => {
    resetCrawlState();

    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'pagescribe-save-selection',
        title: 'PageScribe: Save selection as Markdown',
        contexts: ['selection'],
      });
      chrome.contextMenus.create({
        id: 'pagescribe-summarize-selection',
        title: 'PageScribe: Summarize selection',
        contexts: ['selection'],
      });
      chrome.contextMenus.create({
        id: 'pagescribe-highlight-selection',
        title: 'PageScribe: Highlight & save quote',
        contexts: ['selection'],
      });
    });
  });

  chrome.commands.onCommand.addListener(async (command) => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id) return;

      if (command === 'open-side-panel' && tab.windowId !== undefined) {
        await chrome.sidePanel.open({ windowId: tab.windowId });
      } else if (command === 'save-page-markdown') {
        const extracted = await sendMessageToTabWithFallback(tab.id, {
          action: 'extractContent',
          autoScroll: false,
        });
        if (!extracted || extracted.error) return;
        const stored = await chrome.storage.local.get({ prefs: {} });
        const prefs = (stored.prefs || {}) as Record<string, any>;
        const md = await buildTemplatedMarkdown({
          title: extracted.title || tab.title || 'Untitled',
          url: tab.url || '',
          author: extracted.author,
          publishedTime: extracted.publishedTime,
          siteName: extracted.siteName,
          description: extracted.description,
          content: extracted.markdown || extracted.content || '',
          templateId: prefs.activeTemplateId,
        });
        await chrome.downloads.download({
          url: stringToDataUrl(md, 'text/markdown'),
          filename: `${sanitizeFilename(extracted.title || tab.title || 'page')}.md`,
          saveAs: true,
        });
      }
    } catch (err) {
      console.error('Command handler error:', err);
    }
  });

  chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    const selectionText = info.selectionText?.trim();
    if (!selectionText) return;
    const title = tab?.title || 'Selected Text';
    const url = tab?.url || '';

    if (info.menuItemId === 'pagescribe-save-selection') {
      const frontmatter = generateFrontmatter({ title, url });
      const fileContent = `${frontmatter}\n${selectionText}`;
      await chrome.downloads.download({
        url: stringToDataUrl(fileContent, 'text/markdown'),
        filename: `${sanitizeFilename(title)}_selection.md`,
        saveAs: true,
      });
    } else if (info.menuItemId === 'pagescribe-summarize-selection') {
      const aiConfig = await getAIConfig();
      const { result } = await summarizeWithAI(selectionText, 'short', 'bullets', aiConfig);
      await appendHistory({
        type: 'summarize',
        title: `${title} (Selection)`,
        result,
        timestamp: Date.now(),
      });
      await chrome.storage.local.set({
        latestContextResult: { title, result, timestamp: Date.now() },
      });
    } else if (info.menuItemId === 'pagescribe-highlight-selection' && tab?.id) {
      try {
        await sendMessageToTabWithFallback(tab.id, { action: 'highlightSelection' });
      } catch {
        // Ignore DOM mark errors on restricted frames
      }
      const res = await chrome.storage.local.get({ pageHighlights: [] });
      const existing = (res.pageHighlights as PageHighlight[]) || [];
      const newHighlight: PageHighlight = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        url: normalizeHighlightUrl(url),
        text: selectionText,
        createdAt: Date.now(),
      };
      await chrome.storage.local.set({
        pageHighlights: [newHighlight, ...existing].slice(0, 200),
      });
    }
  });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.target === 'offscreen') {
      return false;
    }

    (async () => {
      try {
        if (request.action === 'extractTabContent') {
          const response = await sendMessageToTabWithFallback(request.tabId, {
            action: 'extractContent',
            autoScroll: Boolean(request.autoScroll),
            includeSelector: request.includeSelector,
            excludeSelectors: request.excludeSelectors,
          });
          sendResponse(response);
        } else if (request.action === 'processContent' || request.action === 'processText') {
          const {
            type,
            title = 'Untitled',
            summaryLength = 'medium',
            summaryFormat = 'paragraph',
            exportFormat = 'markdown',
            author,
            publishedTime,
            siteName,
            description,
            url,
          } = request;

          const content: string =
            request.action === 'processContent'
              ? request.markdown || request.content || ''
              : request.content || '';
          const html: string = request.html || '';

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
              fileContent = await buildTemplatedMarkdown({
                title,
                url: url || sender.tab?.url || '',
                author,
                publishedTime,
                siteName,
                description,
                content,
                templateId: request.templateId,
                customTemplateBody: request.customTemplateBody,
              });
              mimeType = 'text/markdown';
              fileExtension = 'md';
            }

            await chrome.downloads.download({
              url: stringToDataUrl(fileContent, mimeType),
              filename: `${safeTitle}.${fileExtension}`,
              saveAs: true,
            });
            sendResponse({ result: `Content saved as ${fileExtension.toUpperCase()} file.` });
          } else if (type === 'renderMarkdown') {
            const rendered = await buildTemplatedMarkdown({
              title,
              url: url || sender.tab?.url || '',
              author,
              publishedTime,
              siteName,
              description,
              content,
              templateId: request.templateId,
              customTemplateBody: request.customTemplateBody,
            });
            sendResponse({ result: rendered });
          } else if (type === 'stats') {
            const stats = calculateContentStats(content);
            sendResponse({ result: formatStatsResult(stats), stats });
          } else if (type === 'preview') {
            const previewContent = exportFormat === 'html' ? html : content;
            sendResponse({ result: 'Preview ready', preview: previewContent });
          } else if (type === 'summarize') {
            const aiConfig = await getAIConfig();
            const { result: summary, usedProvider } = await summarizeWithAI(
              content,
              summaryLength as SummaryLength,
              summaryFormat as SummaryFormat,
              aiConfig
            );
            await appendHistory({
              type: 'summarize',
              title,
              result: summary,
              timestamp: Date.now(),
            });
            sendResponse({ result: summary, usedProvider });
          } else if (type === 'keywords') {
            const result = extractRankedKeywords(content);
            await appendHistory({
              type: 'keywords',
              title,
              result,
              timestamp: Date.now(),
            });
            sendResponse({ result });
          } else {
            sendResponse({ error: `Unknown action type: ${type}` });
          }
        } else if (request.action === 'askAI') {
          const aiConfig = await getAIConfig();
          const { answer, usedProvider } = await askWithAI(
            request.question || '',
            request.content || '',
            aiConfig
          );
          await appendHistory({
            type: 'qa',
            title: `${request.title || 'Page'}: ${request.question}`,
            result: answer,
            timestamp: Date.now(),
          });
          sendResponse({ result: answer, usedProvider });
        } else if (request.action === 'analyze') {
          const { content = '', markdown = '' } = request;
          sendResponse({
            sentiment: analyzeSentiment(content),
            readability: calculateReadability(content),
            entities: extractEntities(content),
            toc: generateTableOfContents(markdown),
            language: detectLanguage(content),
          });
        } else if (request.action === 'parsePdf') {
          await ensureOffscreenDocument();
          const offscreenResponse = await chrome.runtime.sendMessage({
            target: 'offscreen',
            action: 'offscreenParsePdf',
            pdfData: request.pdfData,
          });
          sendResponse(offscreenResponse);
        } else if (request.action === 'startCrawl') {
          const combinedExcludes = [request.excludePatterns, request.excludePattern]
            .filter((s): s is string => Boolean(s && s.trim()))
            .join(',');

          crawl({
            startUrl: request.startUrl,
            depth: request.depth ?? 1,
            stayOnDomain: request.stayOnDomain ?? true,
            maxPages: request.maxPages ?? 20,
            excludePatterns: combinedExcludes,
            crawlDelay: request.crawlDelay ?? 500,
            exportFormat:
              request.exportFormat === 'csv'
                ? 'csv'
                : request.exportFormat === 'llms'
                  ? 'llms'
                  : 'json',
            autoSummarize: Boolean(request.autoSummarize),
            autoScroll: Boolean(request.autoScroll),
            respectRobots: request.respectRobots ?? true,
            concurrency: request.concurrency ?? 1,
          });
          sendResponse({ result: 'Crawl started.' });
        } else if (request.action === 'stopCrawl') {
          crawlAbortRequested = true;
          sendResponse({ result: 'Stopping crawl...' });
        } else if (request.action === 'exportCrawlResults') {
          const items = (request.items as CrawledData[]) || [];
          const format =
            request.format === 'csv' ? 'csv' : request.format === 'llms' ? 'llms' : 'json';
          await downloadCrawlData(items, format);
          sendResponse({ result: `Exported ${items.length} pages as ${format.toUpperCase()}.` });
        } else {
          sendResponse({ error: `Unknown background action: ${request.action}` });
        }
      } catch (e) {
        console.error('Background error:', e);
        sendResponse({
          error: e instanceof Error ? e.message : 'An unexpected error occurred.',
        });
      }
    })();

    return true;
  });
});
