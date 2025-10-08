import { useState, useEffect } from 'react';
import './App.css';

type Action = 'save' | 'keywords' | 'stats' | 'preview' | 'summarize';
type ExportFormat = 'markdown' | 'html';
type ActiveTab = 'process' | 'crawl' | 'history';

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
  const [activeTab, setActiveTab] = useState<ActiveTab>('process');
  const [contentStats, setContentStats] = useState<ContentStats | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>('markdown');
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [previewContent, setPreviewContent] = useState<string>('');

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

  const processContent = async () => {
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
          markdown: response.markdown,
          content: response.content, // For keyword extraction
          title: response.title,
          html: response.html, // Add HTML content for HTML export
          exportFormat: exportFormat,
        });

        if (processResponse?.result) {
          setResult(processResponse.result);
          setStatus('Action completed successfully!');
          // Set content statistics if available
          if (processResponse.stats) {
            setContentStats(processResponse.stats);
          }
          // Set preview content if available
          if (processResponse.preview) {
            setPreviewContent(processResponse.preview);
          }
        } else {
          setStatus('Failed to process content.');
        }
      }
    } catch (error: unknown) {
      console.error('Error processing content:', error);
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
        <TabButton tab="process" activeTab={activeTab} onClick={setActiveTab}><ProcessIcon /><span>Process</span></TabButton>
        <TabButton tab="crawl" activeTab={activeTab} onClick={setActiveTab}><CrawlIcon /><span>Crawl</span></TabButton>
        <TabButton tab="history" activeTab={activeTab} onClick={setActiveTab}><HistoryIcon /><span>History</span></TabButton>
      </nav>
      <main>
        <div className={`tab-content ${activeTab === 'process' ? 'active' : ''}`}>
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
          {(action === 'save' || action === 'preview') && (
            <div className="form-group">
              <label htmlFor="export-format">Export Format</label>
              <select id="export-format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)}>
                <option value="markdown">Markdown (.md)</option>
                <option value="html">HTML (.html)</option>
              </select>
            </div>
          )}
          <button className="primary-button" onClick={processContent} disabled={loading || isCrawling}>
            {loading ? 'Processing...' : 'Go'}
          </button>
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