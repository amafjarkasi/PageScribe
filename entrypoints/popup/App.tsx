import { useState, useEffect } from 'react';
import './App.css';

type Action = 'save' | 'keywords' | 'stats' | 'preview' | 'summarize';
type PdfAction = 'summarize' | 'keywords';
type ExportFormat = 'markdown' | 'html';
type ActiveTab = 'page' | 'pdf' | 'crawl' | 'history' | 'analysis';
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

const TabButton = ({ tab, activeTab, onClick, children }: { tab: ActiveTab, activeTab: ActiveTab, onClick: (tab: ActiveTab) => void, children: React.ReactNode }) => (
  <button onClick={() => onClick(tab)} className={activeTab === tab ? 'active' : ''}>
    {children}
  </button>
);

const ProcessIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M4 20h2"/><path d="M6 14h12"/><path d="M18 14h2"/><path d="M4 14h2"/><path d="M12 8h9"/><path d="M4 8h2"/><path d="M6 4h12"/><path d="M18 4h2"/><path d="M4 4h2"/></svg>;
const PdfIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>;
const CrawlIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M12 2v20"/><circle cx="12" cy="12" r="4"/></svg>;
const HistoryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>;
const AnalysisIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>;
const ThemeIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>;

function App() {
  const [status, setStatus] = useState('');
  const [result, setResult] = useState('');
  const [action, setAction] = useState<Action>('save');
  const [loading, setLoading] = useState(false);
  const [isCrawling, setIsCrawling] = useState(false);
  const [crawlDepth, setCrawlDepth] = useState(1);
  const [maxPages, setMaxPages] = useState(20);
  const [crawlDelay, setCrawlDelay] = useState(500);
  const [excludePatterns, setExcludePatterns] = useState('');
  const [crawlFormat, setCrawlFormat] = useState<'json' | 'csv'>('json');
  const [autoSummarize, setAutoSummarize] = useState(false);
  const [doAutoScroll, setDoAutoScroll] = useState(false);
  const [stayOnDomain, setStayOnDomain] = useState(true);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      setPdfFile(e.target.files[0]);
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
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'extractContent',
          autoScroll: doAutoScroll
        });
        
        const processResponse = await chrome.runtime.sendMessage({
          action: 'processContent',
          type: action,
          title: response.title,
          markdown: response.markdown,
          html: response.html,
          exportFormat: exportFormat,
          summaryLength: summaryLength,
          summaryFormat: summaryFormat,
          metadata: response.metadata,
          url: tab.url
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
          setProcessedTitle(pdfFile.name.replace(/\.pdf$/i, ''));
          setPdfMetadata({
            pages: response.numpages,
            info: response.info,
            metadata: response.metadata
          });
          setStatus('PDF parsed successfully! Choose an action below.');
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
  };

  const handlePdfAction = async () => {
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
          maxPages: maxPages,
          crawlDelay: crawlDelay,
          excludePatterns: excludePatterns,
          exportFormat: crawlFormat,
          autoSummarize: autoSummarize,
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

  const exportHistory = (format: 'json' | 'csv') => {
    let content: string;
    let mimeType: string;
    let filename: string;

    if (format === 'csv') {
      const headers = ['Type', 'Title', 'Result', 'Timestamp'];
      const rows = history.map(item => [
        item.type,
        `"${item.title.replace(/"/g, '""')}"`,
        `"${item.result.replace(/"/g, '""')}"`,
        new Date(item.timestamp).toISOString()
      ].join(','));
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

  const filteredHistory = history.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         item.result.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = historyFilter === 'all' || item.type === historyFilter;
    return matchesSearch && matchesFilter;
  });

  const toggleTheme = () => {
    const newTheme = !isDarkMode;
    setIsDarkMode(newTheme);
    chrome.storage.local.set({ isDarkMode: newTheme });
  };

  const handleAnalyze = async () => {
    setLoading(true);
    setStatus('Analyzing content...');
    setAnalysisResult(null);
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, {
          action: 'extractContent',
          autoScroll: doAutoScroll
        });
        const processResponse = await chrome.runtime.sendMessage({
          action: 'analyze',
          content: response.content,
          markdown: response.markdown,
          title: response.title,
          metadata: response.metadata
        });

        if (processResponse) {
          setAnalysisResult(processResponse);
          setStatus('Analysis complete!');
        } else {
          setStatus('Failed to analyze content.');
        }
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
              <button className="secondary-button" onClick={() => { setProcessedText(''); setPdfMetadata(null); }} style={{marginTop: '10px'}}>
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
          <div className="form-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px'}}>
            <div className="form-group">
              <label htmlFor="crawl-depth">Depth</label>
              <input type="number" id="crawl-depth" value={crawlDepth} onChange={(e) => setCrawlDepth(parseInt(e.target.value, 10))} min="1" />
            </div>
            <div className="form-group">
              <label htmlFor="max-pages">Max Pages</label>
              <input type="number" id="max-pages" value={maxPages} onChange={(e) => setMaxPages(parseInt(e.target.value, 10))} min="1" />
            </div>
            <div className="form-group">
              <label htmlFor="crawl-delay">Delay (ms)</label>
              <input type="number" id="crawl-delay" value={crawlDelay} onChange={(e) => setCrawlDelay(parseInt(e.target.value, 10))} min="0" step="100" />
            </div>
            <div className="form-group">
              <label htmlFor="crawl-format">Format</label>
              <select id="crawl-format" value={crawlFormat} onChange={(e) => setCrawlFormat(e.target.value as 'json' | 'csv')}>
                <option value="json">JSON</option>
                <option value="csv">CSV</option>
              </select>
            </div>
          </div>
          <div className="form-group">
            <label htmlFor="exclude-patterns">Exclude (comma-sep regex)</label>
            <input type="text" id="exclude-patterns" value={excludePatterns} onChange={(e) => setExcludePatterns(e.target.value)} placeholder="e.g. login, logout, /api/.*" />
          </div>
          <div className="checkbox-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '10px'}}>
            <div className="checkbox-group">
              <input type="checkbox" id="stay-on-domain" checked={stayOnDomain} onChange={(e) => setStayOnDomain(e.target.checked)} />
              <label htmlFor="stay-on-domain">Stay on domain</label>
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
          <button className="primary-button" onClick={startCrawl} disabled={isCrawling}>
            {isCrawling ? 'Crawling...' : 'Start Crawl'}
          </button>
        </div>

        <div className={`tab-content ${activeTab === 'analysis' ? 'active' : ''}`}>
          <div className="analysis-header" style={{display: 'flex', gap: '5px', marginBottom: '10px'}}>
            <button className="primary-button" onClick={handleAnalyze} disabled={loading} style={{flex: 1}}>
              {loading ? 'Analyzing...' : 'Analyze Page'}
            </button>
            <div className="checkbox-group" style={{fontSize: '0.8em', display: 'flex', alignItems: 'center'}}>
              <input type="checkbox" id="analyze-scroll" checked={doAutoScroll} onChange={(e) => setDoAutoScroll(e.target.checked)} />
              <label htmlFor="analyze-scroll">Scroll</label>
            </div>
          </div>
          {analysisResult && (
            <div className="analysis-results" style={{marginTop: '15px'}}>
              <div className="info-grid" style={{display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '15px'}}>
                <div className="result-box">
                  <h4>Tone & Lang</h4>
                  <p>Tone: <strong>{analysisResult.sentiment.type.toUpperCase()}</strong></p>
                  <p>Lang: <strong>{analysisResult.language}</strong></p>
                </div>
                <div className="result-box">
                  <h4>Readability</h4>
                  <p>Ease: {analysisResult.readability.fleschEase}</p>
                  <p>Grade: {analysisResult.readability.fleschKincaidGrade}</p>
                </div>
              </div>

              {analysisResult.metadata && (
                <div className="result-box">
                  <h4>Page Metadata:</h4>
                  <p style={{fontSize: '0.8em', textAlign: 'left'}}>
                    {analysisResult.metadata.author && <div><strong>Author:</strong> {analysisResult.metadata.author}</div>}
                    {analysisResult.metadata.description && <div><strong>Desc:</strong> {analysisResult.metadata.description}</div>}
                    {analysisResult.metadata.ogTitle && <div><strong>OG Title:</strong> {analysisResult.metadata.ogTitle}</div>}
                  </p>
                </div>
              )}

              <div className="result-box">
                <h4>Entities:</h4>
                <p style={{fontSize: '0.85em'}}>
                  <strong>Emails:</strong> {analysisResult.entities.emails.join(', ') || 'None'}<br/>
                  <strong>Phones:</strong> {analysisResult.entities.phoneNumbers.join(', ') || 'None'}
                </p>
              </div>
              {analysisResult.toc.length > 0 && (
                <div className="result-box">
                  <h4>Table of Contents:</h4>
                  <ul style={{textAlign: 'left', fontSize: '0.9em', maxHeight: '150px', overflowY: 'auto'}}>
                    {analysisResult.toc.map((item: any, i: number) => (
                      <li key={i} style={{marginLeft: `${(item.level-1)*10}px`}}>{item.text}</li>
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

          <div className="history-controls" style={{marginBottom: '10px', display: 'flex', gap: '5px'}}>
            <input
              type="text"
              placeholder="Search history..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{flex: 1, padding: '5px'}}
            />
            <select value={historyFilter} onChange={(e) => setHistoryFilter(e.target.value)} style={{padding: '5px'}}>
              <option value="all">All</option>
              <option value="keywords">Keywords</option>
              <option value="summarize">Summary</option>
            </select>
          </div>

          <div className="history-list">
            {filteredHistory.length > 0 ? (
              filteredHistory.map((item: any) => (
                <div key={item.timestamp} className="history-item">
                  <div className="history-badge">{item.type.toUpperCase()}</div>
                  <h4>{item.title}</h4>
                  <p className="history-result">{item.result}</p>
                  <div className="history-footer">
                    <small>{new Date(item.timestamp).toLocaleString()}</small>
                  </div>
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
