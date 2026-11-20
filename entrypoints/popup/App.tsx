import { useState, useEffect } from 'react';
import { sanitizeHTML } from '../../utils/dom';
import { DEFAULT_AI_CONFIG, type AIConfig, type AIProvider } from '../../utils/llm';
import { normalizeDomain, parseSelectorList, type SelectorRule } from '../../utils/rules';
import { BUILTIN_TEMPLATES, buildObsidianUri } from '../../utils/templates';
import { normalizeHighlightUrl, type PageHighlight } from '../../utils/highlights';
import './App.css';

type Action = 'save' | 'obsidian' | 'preview' | 'keywords' | 'stats' | 'summarize' | 'ask';
type PdfAction = 'summarize' | 'keywords' | 'ask';
type ExportFormat = 'markdown' | 'html';
type ActiveTab = 'page' | 'pdf' | 'crawl' | 'history' | 'analysis';
type SummaryLength = 'short' | 'medium' | 'long';
type SummaryFormat = 'paragraph' | 'bullets';

interface HistoryItem {
  type: 'keywords' | 'summarize' | 'qa';
  title: string;
  result: string;
  timestamp: number;
}

interface ContentStats {
  wordCount: number;
  charCount: number;
  readingTime: number;
  paragraphs: number;
}

interface CrawlLogEntry {
  url: string;
  title?: string;
  status: 'success' | 'failed' | 'skipped';
  reason?: string;
  wordCount?: number;
  timestamp: number;
}

interface CrawledDataItem {
  url: string;
  title: string;
  content: string;
  wordCount?: number;
  summary?: string;
}

const TabButton = ({
  tab,
  activeTab,
  onClick,
  children,
}: {
  tab: ActiveTab;
  activeTab: ActiveTab;
  onClick: (tab: ActiveTab) => void;
  children: React.ReactNode;
}) => (
  <button onClick={() => onClick(tab)} className={activeTab === tab ? 'active' : ''}>
    {children}
  </button>
);

const ProcessIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 20h9" /><path d="M4 20h2" /><path d="M6 14h12" /><path d="M18 14h2" /><path d="M4 14h2" /><path d="M12 8h9" /><path d="M4 8h2" /><path d="M6 4h12" /><path d="M18 4h2" /><path d="M4 4h2" />
  </svg>
);
const PdfIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" />
  </svg>
);
const CrawlIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M2 12h20" /><path d="M12 2v20" /><circle cx="12" cy="12" r="4" />
  </svg>
);
const HistoryIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 12h18M3 6h18M3 18h18" />
  </svg>
);
const AnalysisIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21.21 15.89A10 10 0 1 1 8 2.83" /><path d="M22 12A10 10 0 0 0 12 2v10z" />
  </svg>
);
const ThemeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
  </svg>
);
const SidePanelIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" /><line x1="15" y1="3" x2="15" y2="21" />
  </svg>
);
const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

function App({ isSidePanel = false }: { isSidePanel?: boolean }) {
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [action, setAction] = useState<Action>('save');
  const [loading, setLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlProgress, setCrawlProgress] = useState<{ visited: number; queue: number } | null>(null);
  const [crawlLog, setCrawlLog] = useState<CrawlLogEntry[]>([]);
  const [crawlResults, setCrawlResults] = useState<CrawledDataItem[]>([]);
  const [selectedCrawlUrls, setSelectedCrawlUrls] = useState<Record<string, boolean>>({});
  const [crawlDepth, setCrawlDepth] = useState(1);
  const [maxPages, setMaxPages] = useState(20);
  const [crawlDelay, setCrawlDelay] = useState(500);
  const [crawlConcurrency, setCrawlConcurrency] = useState(1);
  const [respectRobots, setRespectRobots] = useState(true);
  const [excludePatterns, setExcludePatterns] = useState('');
  const [crawlFormat, setCrawlFormat] = useState<'json' | 'csv' | 'llms'>('json');
  const [stayOnDomain, setStayOnDomain] = useState(true);
  const [autoSummarize, setAutoSummarize] = useState(false);
  const [doAutoScroll, setDoAutoScroll] = useState(false);
  const [activeTemplateId, setActiveTemplateId] = useState('default');
  const [obsidianVault, setObsidianVault] = useState('');
  const [pageHighlights, setPageHighlights] = useState<PageHighlight[]>([]);
  const [currentTabUrl, setCurrentTabUrl] = useState('');
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('page');
  const [searchQuery, setSearchQuery] = useState('');
  const [historyFilter, setHistoryFilter] = useState<string>('all');
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
  const [pdfMetadata, setPdfMetadata] = useState<any>(null);
  const [analysisResult, setAnalysisResult] = useState<any>(null);

  // Selector Rules state
  const [showSelectorRules, setShowSelectorRules] = useState(false);
  const [includeSelector, setIncludeSelector] = useState('');
  const [excludeSelectorsInput, setExcludeSelectorsInput] = useState('');
  const [selectorRules, setSelectorRules] = useState<SelectorRule[]>([]);

  // AI Settings & Q&A state
  const [showAISettings, setShowAISettings] = useState(false);
  const [aiConfig, setAiConfig] = useState<AIConfig>(DEFAULT_AI_CONFIG);
  const [aiQuestion, setAiQuestion] = useState('');

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setPdfFile(e.target.files[0]);
      setProcessedTitle(e.target.files[0].name);
    }
  };

  useEffect(() => {
    const stateListener = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes.history) {
        setHistory((changes.history.newValue as HistoryItem[]) || []);
      }
      if (changes.isCrawling) {
        const crawling = Boolean(changes.isCrawling.newValue);
        setIsCrawling(crawling);
        setStatus(crawling ? 'Crawling in progress...' : 'Crawl finished.');
      }
      if (changes.crawlProgress) {
        setCrawlProgress((changes.crawlProgress.newValue as any) || null);
      }
      if (changes.crawlLog) {
        setCrawlLog((changes.crawlLog.newValue as CrawlLogEntry[]) || []);
      }
      if (changes.crawlResults) {
        const items = (changes.crawlResults.newValue as CrawledDataItem[]) || [];
        setCrawlResults(items);
        setSelectedCrawlUrls((prev) => {
          const next = { ...prev };
          for (const item of items) {
            if (next[item.url] === undefined) next[item.url] = true;
          }
          return next;
        });
      }
    };
    chrome.storage.onChanged.addListener(stateListener);

    chrome.storage.local.get(
      {
        history: [],
        isCrawling: false,
        isDarkMode: false,
        crawlProgress: null,
        crawlLog: [],
        crawlResults: [],
        selectorRules: [],
        aiConfig: DEFAULT_AI_CONFIG,
        pageHighlights: [],
        prefs: {},
      },
      (res) => {
        setHistory((res.history as HistoryItem[]) || []);
        setIsCrawling(Boolean(res.isCrawling));
        setCrawlProgress((res.crawlProgress as any) || null);
        setCrawlLog((res.crawlLog as CrawlLogEntry[]) || []);
        const items = (res.crawlResults as CrawledDataItem[]) || [];
        setCrawlResults(items);
        const initialSelected: Record<string, boolean> = {};
        items.forEach((i) => {
          initialSelected[i.url] = true;
        });
        setSelectedCrawlUrls(initialSelected);
        setIsDarkMode(Boolean(res.isDarkMode));
        setSelectorRules((res.selectorRules as SelectorRule[]) || []);
        setAiConfig({ ...DEFAULT_AI_CONFIG, ...(res.aiConfig as Partial<AIConfig>) });
        setPageHighlights((res.pageHighlights as PageHighlight[]) || []);
        const prefs = (res.prefs || {}) as Record<string, any>;
        if (prefs.exportFormat) setExportFormat(prefs.exportFormat);
        if (prefs.summaryLength) setSummaryLength(prefs.summaryLength);
        if (prefs.summaryFormat) setSummaryFormat(prefs.summaryFormat);
        if (prefs.crawlDepth !== undefined) setCrawlDepth(prefs.crawlDepth);
        if (prefs.maxPages !== undefined) setMaxPages(prefs.maxPages);
        if (prefs.crawlDelay !== undefined) setCrawlDelay(prefs.crawlDelay);
        if (prefs.crawlConcurrency !== undefined) setCrawlConcurrency(prefs.crawlConcurrency);
        if (prefs.crawlFormat) setCrawlFormat(prefs.crawlFormat);
        if (prefs.stayOnDomain !== undefined) setStayOnDomain(prefs.stayOnDomain);
        if (prefs.respectRobots !== undefined) setRespectRobots(prefs.respectRobots);
        if (prefs.autoSummarize !== undefined) setAutoSummarize(prefs.autoSummarize);
        if (prefs.doAutoScroll !== undefined) setDoAutoScroll(prefs.doAutoScroll);
        if (prefs.activeTemplateId) setActiveTemplateId(prefs.activeTemplateId);
        if (prefs.obsidianVault !== undefined) setObsidianVault(prefs.obsidianVault);
        if (res.isCrawling) {
          setStatus('Crawling in progress...');
        }
      }
    );

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url) setCurrentTabUrl(tabs[0].url);
    });

    return () => {
      chrome.storage.onChanged.removeListener(stateListener);
    };
  }, []);

  const savePrefs = (patch: Record<string, unknown>) => {
    chrome.storage.local.get({ prefs: {} }, (res) => {
      chrome.storage.local.set({ prefs: { ...(res.prefs as Record<string, unknown>), ...patch } });
    });
  };

  const extractActiveTabContent = async (autoScroll: boolean) => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      throw new Error('No active tab found.');
    }
    if (tab.url && /^(chrome|edge|about|chrome-extension):/i.test(tab.url)) {
      throw new Error('Cannot extract content from browser internal pages.');
    }

    const response = await chrome.runtime.sendMessage({
      action: 'extractTabContent',
      tabId: tab.id,
      autoScroll,
      includeSelector: includeSelector.trim() || undefined,
      excludeSelectors: parseSelectorList(excludeSelectorsInput),
    });

    if (!response) {
      throw new Error('No response from page. Try refreshing the tab.');
    }
    if (response.error) {
      throw new Error(response.error);
    }
    return { tab, response };
  };

  const handleSaveSelectorRule = async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.url || !/^https?:/i.test(tab.url)) {
        setStatus('Open an HTTP/HTTPS page to save a domain rule.');
        return;
      }
      const domain = normalizeDomain(new URL(tab.url).hostname);
      const newRule: SelectorRule = {
        domain,
        includeSelector: includeSelector.trim() || undefined,
        excludeSelectors: parseSelectorList(excludeSelectorsInput),
      };
      const updated = [newRule, ...selectorRules.filter((r) => normalizeDomain(r.domain) !== domain)];
      setSelectorRules(updated);
      await chrome.storage.local.set({ selectorRules: updated });
      setStatus(`Saved selector rule for ${domain}`);
    } catch (err) {
      setStatus(`Error saving rule: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleSaveAIConfig = async (next: AIConfig) => {
    setAiConfig(next);
    await chrome.storage.local.set({ aiConfig: next });
  };

  const handlePageAction = async () => {
    setLoading(true);
    setStatus(`Performing action: ${action}...`);
    setResult('');
    setContentStats(null);
    setPreviewContent('');
    try {
      const { tab, response } = await extractActiveTabContent(doAutoScroll);

      if (action === 'ask') {
        const qaRes = await chrome.runtime.sendMessage({
          action: 'askAI',
          question: aiQuestion,
          content: response.markdown || response.content || '',
          title: response.title,
        });
        if (qaRes?.error) {
          setStatus(`Error: ${qaRes.error}`);
        } else {
          setResult(qaRes?.result || '');
          setStatus(`Answer ready (${qaRes?.usedProvider || 'offline'}).`);
        }
        return;
      }

      if (action === 'obsidian') {
        const rendered = await chrome.runtime.sendMessage({
          action: 'processContent',
          type: 'renderMarkdown',
          title: response.title,
          markdown: response.markdown,
          content: response.content,
          author: response.author,
          publishedTime: response.publishedTime,
          siteName: response.siteName,
          description: response.description,
          url: tab.url,
          templateId: activeTemplateId === 'default' ? 'obsidian' : activeTemplateId,
        });
        if (rendered?.result) {
          const uri = buildObsidianUri(obsidianVault, response.title || 'PageScribe Note', rendered.result);
          window.open(uri, '_blank');
          setStatus('Opened in Obsidian!');
        } else {
          setStatus('Failed to render Obsidian note.');
        }
        return;
      }

      const processResponse = await chrome.runtime.sendMessage({
        action: 'processContent',
        type: action,
        title: response.title,
        markdown: response.markdown,
        content: response.content,
        html: response.html,
        author: response.author,
        publishedTime: response.publishedTime,
        siteName: response.siteName,
        description: response.description,
        url: tab.url,
        exportFormat,
        summaryLength,
        summaryFormat,
        templateId: activeTemplateId,
      });

      if (processResponse?.error) {
        setStatus(`Error: ${processResponse.error}`);
      } else if (processResponse?.result) {
        setResult(processResponse.result);
        setStatus('Action completed successfully!');
        if (processResponse.stats) setContentStats(processResponse.stats);
        if (processResponse.preview) setPreviewContent(processResponse.preview);
      } else {
        setStatus('Failed to process content.');
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
    setProcessedText('');

    const reader = new FileReader();
    reader.onerror = () => {
      setStatus('Failed to read PDF file.');
      setLoading(false);
    };
    reader.onload = async () => {
      try {
        const base64Data = reader.result as string;
        const response = await chrome.runtime.sendMessage({
          action: 'parsePdf',
          pdfData: base64Data,
        });

        if (response?.text) {
          setProcessedText(response.text);
          setProcessedTitle(pdfFile.name.replace(/\.pdf$/i, ''));
          setPdfMetadata({
            pages: response.numpages,
            info: response.info,
            metadata: response.metadata,
          });
          setStatus('PDF processed successfully! Choose an action below.');
        } else {
          setStatus(response?.error || 'Failed to parse PDF.');
        }
      } catch (error: unknown) {
        console.error('Error parsing PDF:', error);
        const message = error instanceof Error ? error.message : String(error);
        setStatus(`Error: ${message}`);
      } finally {
        setLoading(false);
      }
    };
    reader.readAsDataURL(pdfFile);
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
      if (pdfAction === 'ask') {
        const qaRes = await chrome.runtime.sendMessage({
          action: 'askAI',
          question: aiQuestion,
          content: processedText,
          title: processedTitle,
        });
        if (qaRes?.error) {
          setStatus(`Error: ${qaRes.error}`);
        } else {
          setResult(qaRes?.result || '');
          setStatus(`Answer ready (${qaRes?.usedProvider || 'offline'}).`);
        }
        return;
      }

      const response = await chrome.runtime.sendMessage({
        action: 'processText',
        type: pdfAction,
        content: processedText,
        title: processedTitle,
        summaryLength,
        summaryFormat,
      });

      if (response?.error) {
        setStatus(`Error: ${response.error}`);
      } else if (response?.result) {
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

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setStatus('Copied to clipboard!');
    setTimeout(() => setStatus(''), 2000);
  };

  const startCrawl = async () => {
    setStatus('Checking permissions...');
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab?.id || !tab.url || !/^https?:/i.test(tab.url)) {
        setStatus('Error: Can only crawl http:// or https:// pages.');
        return;
      }

      const granted = await chrome.permissions.request({ origins: ['<all_urls>'] });
      if (!granted) {
        setStatus('Host permission denied. Crawling requires permission to open and read linked pages.');
        return;
      }

      setStatus('Starting crawl...');
      await chrome.runtime.sendMessage({
        action: 'startCrawl',
        startUrl: tab.url,
        depth: crawlDepth,
        stayOnDomain,
        maxPages,
        crawlDelay,
        excludePatterns,
        exportFormat: crawlFormat,
        autoSummarize,
        autoScroll: doAutoScroll,
        respectRobots,
        concurrency: crawlConcurrency,
      });
    } catch (error: unknown) {
      console.error('Error starting crawl:', error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${message}`);
    }
  };

  const stopCrawl = async () => {
    try {
      await chrome.runtime.sendMessage({ action: 'stopCrawl' });
      setStatus('Stopping crawl...');
    } catch (error: unknown) {
      console.error('Error stopping crawl:', error);
    }
  };

  const exportSelectedCrawl = async (format: 'json' | 'csv' | 'llms') => {
    const selected = crawlResults.filter((item) => selectedCrawlUrls[item.url] !== false);
    if (selected.length === 0) {
      setStatus('Select at least one crawled page to export.');
      return;
    }
    const res = await chrome.runtime.sendMessage({
      action: 'exportCrawlResults',
      items: selected,
      format,
    });
    if (res?.result) setStatus(res.result);
  };

  const clearHistory = () => {
    chrome.storage.local.set({ history: [] });
  };

  const exportHistory = (format: 'json' | 'csv') => {
    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === 'csv') {
      const headers = ['Type', 'Title', 'Result', 'Timestamp'];
      const rows = history.map((item) =>
        [
          item.type,
          `"${item.title.replace(/"/g, '""')}"`,
          `"${item.result.replace(/"/g, '""')}"`,
          new Date(item.timestamp).toISOString(),
        ].join(',')
      );
      content = [headers.join(','), ...rows].join('\n');
      mimeType = 'text/csv';
      filename = 'pagescribe_history.csv';
    } else {
      content = JSON.stringify(history, null, 2);
      mimeType = 'application/json';
      filename = 'pagescribe_history.json';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const filteredHistory = history.filter((item) => {
    const matchesSearch =
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.result.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = historyFilter === 'all' || item.type === historyFilter;
    return matchesSearch && matchesFilter;
  });

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    chrome.storage.local.set({ isDarkMode: newTheme });
  };

  const openSidePanel = async () => {
    try {
      const win = await chrome.windows.getCurrent();
      if (win.id !== undefined && chrome.sidePanel?.open) {
        await chrome.sidePanel.open({ windowId: win.id });
        window.close();
      }
    } catch (err) {
      setStatus(`Side panel error: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setStatus('Analyzing content...');
    setAnalysisResult(null);
    try {
      const { response } = await extractActiveTabContent(false);
      const processResponse = await chrome.runtime.sendMessage({
        action: 'analyze',
        content: response.content,
        markdown: response.markdown,
        title: response.title,
      });

      if (processResponse?.error) {
        setStatus(`Error: ${processResponse.error}`);
      } else if (processResponse) {
        setAnalysisResult(processResponse);
        setStatus('Analysis complete!');
      } else {
        setStatus('Failed to analyze content.');
      }
    } catch (error: unknown) {
      console.error('Error analyzing:', error);
      const message = error instanceof Error ? error.message : String(error);
      setStatus(`Error: ${message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`app-container ${isDarkMode ? 'dark-mode' : ''} ${isSidePanel ? 'sidepanel-mode' : ''}`}>
      <header>
        <div className="header-content">
          <h1>PageScribe</h1>
          <div className="header-actions">
            {!isSidePanel && (
              <button className="theme-toggle" onClick={openSidePanel} title="Open in Side Panel">
                <SidePanelIcon />
              </button>
            )}
            <button
              className="theme-toggle"
              onClick={() => setShowAISettings(!showAISettings)}
              title="AI Settings"
            >
              <SettingsIcon />
            </button>
            <button
              className="theme-toggle"
              onClick={toggleTheme}
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <ThemeIcon />
            </button>
          </div>
        </div>
      </header>

      {showAISettings && (
        <div className="ai-settings-panel" style={{ margin: '10px 16px 0' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <strong style={{ fontSize: '13px' }}>AI Provider Settings</strong>
            <button className="text-button" onClick={() => setShowAISettings(false)}>Close</button>
          </div>
          <div className="form-group">
            <label htmlFor="ai-provider">Provider</label>
            <select
              id="ai-provider"
              value={aiConfig.provider}
              onChange={(e) => handleSaveAIConfig({ ...aiConfig, provider: e.target.value as AIProvider })}
            >
              <option value="offline">Offline TF-IDF (Default)</option>
              <option value="chrome-ai">Chrome Built-in AI (Local)</option>
              <option value="openai-compatible">OpenAI-Compatible (BYOK)</option>
            </select>
          </div>
          {aiConfig.provider === 'openai-compatible' && (
            <>
              <div className="form-group">
                <label htmlFor="ai-url">API Endpoint</label>
                <input
                  id="ai-url"
                  type="text"
                  value={aiConfig.apiUrl}
                  onChange={(e) => handleSaveAIConfig({ ...aiConfig, apiUrl: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="ai-model">Model</label>
                <input
                  id="ai-model"
                  type="text"
                  value={aiConfig.model}
                  onChange={(e) => handleSaveAIConfig({ ...aiConfig, model: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label htmlFor="ai-key">API Key</label>
                <input
                  id="ai-key"
                  type="password"
                  placeholder="sk-..."
                  value={aiConfig.apiKey}
                  onChange={(e) => handleSaveAIConfig({ ...aiConfig, apiKey: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
      )}

      <nav>
        <TabButton tab="page" activeTab={activeTab} onClick={setActiveTab}><ProcessIcon /><span>Page</span></TabButton>
        <TabButton tab="pdf" activeTab={activeTab} onClick={setActiveTab}><PdfIcon /><span>PDF</span></TabButton>
        <TabButton tab="analysis" activeTab={activeTab} onClick={setActiveTab}><AnalysisIcon /><span>Analysis</span></TabButton>
        <TabButton tab="crawl" activeTab={activeTab} onClick={setActiveTab}><CrawlIcon /><span>Crawl</span></TabButton>
        <TabButton tab="history" activeTab={activeTab} onClick={setActiveTab}><HistoryIcon /><span>History</span></TabButton>
      </nav>

      <main>
        <div className={`tab-content ${activeTab === 'page' ? 'active' : ''}`}>
          <div className="form-group">
            <label htmlFor="action-select">Action</label>
            <select id="action-select" value={action} onChange={(e) => setAction(e.target.value as Action)}>
              <option value="save">Save Full Content</option>
              <option value="obsidian">Send to Obsidian</option>
              <option value="preview">Preview Content</option>
              <option value="keywords">Extract Keywords</option>
              <option value="stats">Get Statistics</option>
              <option value="summarize">Summarize</option>
              <option value="ask">Ask AI / Q&amp;A</option>
            </select>
          </div>
          {(action === 'save' || action === 'obsidian') && (
            <div className="form-group">
              <label htmlFor="template-select">Clip Template</label>
              <select
                id="template-select"
                value={activeTemplateId}
                onChange={(e) => {
                  setActiveTemplateId(e.target.value);
                  savePrefs({ activeTemplateId: e.target.value });
                }}
              >
                {BUILTIN_TEMPLATES.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}
          {action === 'obsidian' && (
            <div className="form-group">
              <label htmlFor="obsidian-vault">Obsidian Vault (optional)</label>
              <input
                id="obsidian-vault"
                type="text"
                placeholder="e.g. SecondBrain"
                value={obsidianVault}
                onChange={(e) => {
                  setObsidianVault(e.target.value);
                  savePrefs({ obsidianVault: e.target.value });
                }}
              />
            </div>
          )}
          {action === 'ask' && (
            <div className="form-group">
              <label htmlFor="page-question">Question</label>
              <input
                id="page-question"
                type="text"
                placeholder="Ask something about this page..."
                value={aiQuestion}
                onChange={(e) => setAiQuestion(e.target.value)}
              />
            </div>
          )}
          {action === 'summarize' && (
            <>
              <div className="form-group">
                <label htmlFor="summary-length">Summary Length</label>
                <select
                  id="summary-length"
                  value={summaryLength}
                  onChange={(e) => {
                    const val = e.target.value as SummaryLength;
                    setSummaryLength(val);
                    savePrefs({ summaryLength: val });
                  }}
                >
                  <option value="short">Short</option>
                  <option value="medium">Medium</option>
                  <option value="long">Long</option>
                </select>
              </div>
              <div className="form-group">
                <label htmlFor="summary-format">Summary Format</label>
                <select
                  id="summary-format"
                  value={summaryFormat}
                  onChange={(e) => {
                    const val = e.target.value as SummaryFormat;
                    setSummaryFormat(val);
                    savePrefs({ summaryFormat: val });
                  }}
                >
                  <option value="paragraph">Paragraph</option>
                  <option value="bullets">Bullet Points</option>
                </select>
              </div>
            </>
          )}
          {(action === 'save' || action === 'preview') && (
            <div className="form-group">
              <label htmlFor="export-format">Export Format</label>
              <select
                id="export-format"
                value={exportFormat}
                onChange={(e) => {
                  const val = e.target.value as ExportFormat;
                  setExportFormat(val);
                  savePrefs({ exportFormat: val });
                }}
              >
                <option value="markdown">Markdown (.md)</option>
                <option value="html">HTML (.html)</option>
              </select>
            </div>
          )}

          <div style={{ marginBottom: '10px' }}>
            <button
              type="button"
              className="text-button"
              onClick={() => setShowSelectorRules(!showSelectorRules)}
            >
              {showSelectorRules ? 'Hide Selector Rules' : 'Custom Selector Rules'}
            </button>
          </div>

          {showSelectorRules && (
            <div className="selector-rules-panel">
              <div className="form-group">
                <label htmlFor="include-selector">Include CSS Selector</label>
                <input
                  id="include-selector"
                  type="text"
                  placeholder="e.g. main, article.post"
                  value={includeSelector}
                  onChange={(e) => setIncludeSelector(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label htmlFor="exclude-selectors">Exclude CSS Selectors (comma-sep)</label>
                <input
                  id="exclude-selectors"
                  type="text"
                  placeholder="e.g. .ads, nav, .sidebar"
                  value={excludeSelectorsInput}
                  onChange={(e) => setExcludeSelectorsInput(e.target.value)}
                />
              </div>
              <button type="button" className="secondary-button" onClick={handleSaveSelectorRule}>
                Save Rule for Domain ({selectorRules.length} saved)
              </button>
            </div>
          )}

          <button className="primary-button" onClick={handlePageAction} disabled={loading || isCrawling}>
            {loading ? 'Processing...' : 'Go'}
          </button>

          {(() => {
            const normUrl = normalizeHighlightUrl(currentTabUrl);
            const currentHighlights = pageHighlights.filter((h) => normalizeHighlightUrl(h.url) === normUrl);
            if (currentHighlights.length === 0) return null;
            return (
              <div className="crawl-results-panel" style={{ marginTop: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: '12px' }}>Page Highlights ({currentHighlights.length})</strong>
                  <button
                    className="text-button"
                    onClick={() => {
                      const remaining = pageHighlights.filter((h) => normalizeHighlightUrl(h.url) !== normUrl);
                      setPageHighlights(remaining);
                      chrome.storage.local.set({ pageHighlights: remaining });
                    }}
                  >
                    Clear
                  </button>
                </div>
                <div className="crawl-log-list">
                  {currentHighlights.map((h) => (
                    <div key={h.id} className="crawl-log-item" style={{ fontSize: '11px' }}>
                      <span>&ldquo;{h.text.slice(0, 120)}{h.text.length > 120 ? '...' : ''}&rdquo;</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>

        <div className={`tab-content ${activeTab === 'pdf' ? 'active' : ''}`}>
          {pdfMetadata && (
            <div className="stats-box metadata-box">
              <h4>PDF Information:</h4>
              <div className="stats-grid">
                <div className="stat-item">
                  <span className="stat-label">Pages:</span>
                  <span className="stat-value">{pdfMetadata.pages}</span>
                </div>
                {pdfMetadata.info?.Author && (
                  <div className="stat-item">
                    <span className="stat-label">Author:</span>
                    <span className="stat-value">{pdfMetadata.info.Author}</span>
                  </div>
                )}
                {pdfMetadata.info?.Creator && (
                  <div className="stat-item">
                    <span className="stat-label">Creator:</span>
                    <span className="stat-value">{pdfMetadata.info.Creator}</span>
                  </div>
                )}
              </div>
            </div>
          )}
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
                  <option value="ask">Ask AI / Q&amp;A</option>
                </select>
              </div>
              {pdfAction === 'ask' && (
                <div className="form-group">
                  <label htmlFor="pdf-question">Question</label>
                  <input
                    id="pdf-question"
                    type="text"
                    placeholder="Ask something about this PDF..."
                    value={aiQuestion}
                    onChange={(e) => setAiQuestion(e.target.value)}
                  />
                </div>
              )}
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
              <button
                className="secondary-button"
                onClick={() => {
                  setProcessedText('');
                  setPdfMetadata(null);
                }}
                style={{ marginTop: '10px' }}
              >
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
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <h4>Result:</h4>
                  <button className="secondary-button" onClick={() => handleCopy(result)}>Copy</button>
                </div>
                <p style={{ whiteSpace: 'pre-wrap' }}>{result}</p>
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
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <h4>Content Preview:</h4>
                  <button className="secondary-button" onClick={() => handleCopy(previewContent)}>Copy</button>
                </div>
                <div className="preview-content">
                  {exportFormat === 'html' ? (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHTML(previewContent) }} />
                  ) : (
                    <pre>{previewContent}</pre>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        <div className={`tab-content ${activeTab === 'crawl' ? 'active' : ''}`}>
          <div className="form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <div className="form-group">
              <label htmlFor="crawl-depth">Depth</label>
              <input type="number" id="crawl-depth" value={crawlDepth} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setCrawlDepth(v); savePrefs({ crawlDepth: v }); }} min="1" max="10" />
            </div>
            <div className="form-group">
              <label htmlFor="max-pages">Max Pages</label>
              <input type="number" id="max-pages" value={maxPages} onChange={(e) => { const v = Math.max(1, parseInt(e.target.value, 10) || 1); setMaxPages(v); savePrefs({ maxPages: v }); }} min="1" max="500" />
            </div>
            <div className="form-group">
              <label htmlFor="crawl-delay">Delay (ms)</label>
              <input type="number" id="crawl-delay" value={crawlDelay} onChange={(e) => { const v = Math.max(0, parseInt(e.target.value, 10) || 0); setCrawlDelay(v); savePrefs({ crawlDelay: v }); }} min="0" step="100" />
            </div>
            <div className="form-group">
              <label htmlFor="crawl-concurrency">Concurrency (1-3)</label>
              <input type="number" id="crawl-concurrency" value={crawlConcurrency} onChange={(e) => { const v = Math.min(3, Math.max(1, parseInt(e.target.value, 10) || 1)); setCrawlConcurrency(v); savePrefs({ crawlConcurrency: v }); }} min="1" max="3" />
            </div>
            <div className="form-group" style={{ gridColumn: '1 / -1' }}>
              <label htmlFor="crawl-format">Auto-Download Format</label>
              <select id="crawl-format" value={crawlFormat} onChange={(e) => { const v = e.target.value as 'json' | 'csv' | 'llms'; setCrawlFormat(v); savePrefs({ crawlFormat: v }); }}>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
                <option value="llms">Knowledge Pack (llms-full.md)</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="exclude-patterns">Exclude (comma-sep regex)</label>
            <input type="text" id="exclude-patterns" value={excludePatterns} onChange={(e) => setExcludePatterns(e.target.value)} placeholder="e.g. login, logout, /api/.*" />
          </div>
          <div className="checkbox-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginBottom: '12px' }}>
            <div className="checkbox-group">
              <input type="checkbox" id="stay-on-domain" checked={stayOnDomain} onChange={(e) => setStayOnDomain(e.target.checked)} />
              <label htmlFor="stay-on-domain">Stay on domain</label>
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="respect-robots" checked={respectRobots} onChange={(e) => setRespectRobots(e.target.checked)} />
              <label htmlFor="respect-robots">Respect robots.txt</label>
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="auto-summarize" checked={autoSummarize} onChange={(e) => setAutoSummarize(e.target.checked)} />
              <label htmlFor="auto-summarize">Auto-Summarize</label>
            </div>
            <div className="checkbox-group">
              <input type="checkbox" id="do-auto-scroll" checked={doAutoScroll} onChange={(e) => setDoAutoScroll(e.target.checked)} />
              <label htmlFor="do-auto-scroll">Auto-Scroll</label>
            </div>
          </div>

          {crawlProgress && (
            <div style={{ marginBottom: '10px', fontSize: '13px' }}>
              <span><strong>Visited:</strong> {crawlProgress.visited}</span>{' | '}
              <span><strong>Queued:</strong> {crawlProgress.queue}</span>
            </div>
          )}

          <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
            <button className="primary-button" onClick={startCrawl} disabled={isCrawling} style={{ flex: 1 }}>
              {isCrawling ? 'Crawling...' : 'Start Crawl'}
            </button>
            {isCrawling && (
              <button className="secondary-button" onClick={stopCrawl}>
                Stop
              </button>
            )}
          </div>

          {crawlLog.length > 0 && (
            <div className="crawl-results-panel">
              <strong style={{ fontSize: '13px' }}>Live Crawl Log ({crawlLog.length})</strong>
              <div className="crawl-log-list">
                {crawlLog.slice().reverse().map((entry, idx) => (
                  <div key={`${entry.url}-${idx}`} className="crawl-log-item">
                    <span className={`crawl-badge ${entry.status}`}>{entry.status}</span>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={entry.reason || entry.url}>
                      {entry.title || entry.url}
                    </span>
                    {entry.wordCount !== undefined && <small>{entry.wordCount}w</small>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {crawlResults.length > 0 && (
            <div className="crawl-results-panel">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <strong style={{ fontSize: '13px' }}>Crawled Pages ({crawlResults.length})</strong>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button className="text-button" onClick={() => exportSelectedCrawl('json')}>JSON</button>
                  <button className="text-button" onClick={() => exportSelectedCrawl('csv')}>CSV</button>
                  <button className="text-button" onClick={() => exportSelectedCrawl('llms')}>llms-full.md</button>
                </div>
              </div>
              <div className="crawl-log-list">
                {crawlResults.map((item) => (
                  <label key={item.url} className="crawl-log-item" style={{ cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={selectedCrawlUrls[item.url] !== false}
                      onChange={(e) =>
                        setSelectedCrawlUrls((prev) => ({ ...prev, [item.url]: e.target.checked }))
                      }
                    />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }} title={item.url}>
                      {item.title || item.url}
                    </span>
                    {item.wordCount !== undefined && <small>{item.wordCount}w</small>}
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className={`tab-content ${activeTab === 'analysis' ? 'active' : ''}`}>
          <button className="primary-button" onClick={handleAnalyze} disabled={loading}>
            {loading ? 'Analyzing...' : 'Analyze Page'}
          </button>
          {status && activeTab === 'analysis' && <p className="status">{status}</p>}
          {analysisResult && (
            <div className="analysis-results" style={{ marginTop: '15px' }}>
              {analysisResult.language && (
                <div className="result-box">
                  <h4>Language:</h4>
                  <p><strong>{analysisResult.language}</strong></p>
                </div>
              )}
              <div className="result-box">
                <h4>Sentiment:</h4>
                <p>Type: <strong>{analysisResult.sentiment.type.toUpperCase()}</strong></p>
                <p>Score: {analysisResult.sentiment.score}</p>
              </div>
              <div className="result-box">
                <h4>Readability:</h4>
                <p>Flesch Ease: {analysisResult.readability.fleschEase}</p>
                <p>Grade Level: {analysisResult.readability.fleschKincaidGrade}</p>
              </div>
              <div className="result-box">
                <h4>Entities:</h4>
                <p>Emails: {analysisResult.entities.emails.join(', ') || 'None'}</p>
                <p>Phones: {analysisResult.entities.phoneNumbers.join(', ') || 'None'}</p>
                <p>URLs ({analysisResult.entities.urls.length}):</p>
                {analysisResult.entities.urls.length > 0 && (
                  <ul style={{ textAlign: 'left', fontSize: '0.85em', maxHeight: '100px', overflowY: 'auto', margin: '4px 0 0' }}>
                    {analysisResult.entities.urls.slice(0, 20).map((u: string, i: number) => (
                      <li key={i} style={{ wordBreak: 'break-all' }}>{u}</li>
                    ))}
                  </ul>
                )}
              </div>
              {analysisResult.toc.length > 0 && (
                <div className="result-box">
                  <h4>Table of Contents:</h4>
                  <ul style={{ textAlign: 'left', fontSize: '0.9em' }}>
                    {analysisResult.toc.map((item: any, i: number) => (
                      <li key={i} style={{ marginLeft: `${(item.level - 1) * 10}px` }}>{item.text}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </div>

        <div className={`tab-content ${activeTab === 'history' ? 'active' : ''}`}>
          <div className="history-header">
            <h3>History</h3>
            <div className="history-actions">
              <button className="text-button" onClick={() => exportHistory('json')}>JSON</button>
              <button className="text-button" onClick={() => exportHistory('csv')}>CSV</button>
              <button className="secondary-button" onClick={clearHistory}>Clear</button>
            </div>
          </div>

          <div className="history-controls" style={{ marginBottom: '10px', display: 'flex', gap: '5px' }}>
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ flex: 1, padding: '5px' }}
            />
            <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} style={{ padding: '5px' }}>
              <option value="all">All</option>
              <option value="keywords">Keywords</option>
              <option value="summarize">Summary</option>
              <option value="qa">Q&amp;A</option>
            </select>
          </div>

          <div className="history-list">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((item, idx) => (
                <div key={`${item.timestamp}-${idx}`} className="history-item">
                  <div className="history-badge">{item.type.toUpperCase()}</div>
                  <h4>{item.title}</h4>
                  <p className="history-result">{item.result}</p>
                  <div className="history-footer">
                    <small>{new Date(item.timestamp).toLocaleString()}</small>
                  </div>
                </div>
              ))
            ) : (
              <p className="empty-history">{history.length > 0 ? 'No matching history items.' : 'No history yet.'}</p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
