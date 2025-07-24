import { useState, useEffect } from 'react';
import './App.css';

type Action = 'save' | 'keywords';
type ActiveTab = 'process' | 'crawl' | 'history';

interface HistoryItem {
  type: 'keywords';
  title: string;
  result: string;
  timestamp: number;
}

const TabButton = ({ tab, activeTab, onClick, children }: { tab: ActiveTab, activeTab: ActiveTab, onClick: (tab: ActiveTab) => void, children: React.ReactNode }) => (
  <button onClick={() => onClick(tab)} className={activeTab === tab ? 'active' : ''}>
    {children}
  </button>
);

const ProcessIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M4 20h2"/><path d="M6 14h12"/><path d="M18 14h2"/><path d="M4 14h2"/><path d="M12 8h9"/><path d="M4 8h2"/><path d="M6 4h12"/><path d="M18 4h2"/><path d="M4 4h2"/></svg>;
const CrawlIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12h20"/><path d="M12 2v20"/><circle cx="12" cy="12" r="4"/></svg>;
const HistoryIcon = () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12h18M3 6h18M3 18h18"/></svg>;

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
    chrome.storage.local.get({ history: [], isCrawling: false }, (res) => {
      setHistory(res.history);
      setIsCrawling(res.isCrawling);
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
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        const response = await chrome.tabs.sendMessage(tab.id, { action: 'extractContent' });
        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
        
        const processResponse = await chrome.runtime.sendMessage({
          action: 'processContent',
          type: action,
          markdown: response.markdown,
          content: response.content, // For keyword extraction
          title: response.title,
        });

        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
        if (processResponse?.result) {
          setResult(processResponse.result);
          setStatus('Action completed successfully!');
        } else {
          setStatus('Failed to process content.');
        }
      }
    } catch (error: any) {
      console.error('Error processing content:', error);
      setStatus(`Error: ${error.message}`);
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
        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
        // No need to set status here, the storage listener will do it
      }
    } catch (error: any) {
      console.error('Error starting crawl:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const clearHistory = () => {
    chrome.storage.local.set({ history: [] });
  };

  return (
    <div className="app-container">
      <header>
        <h1>PageScribe</h1>
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
              <option value="keywords">Extract Keywords</option>
            </select>
          </div>
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