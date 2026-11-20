import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { parseDOMMetadata, sanitizeHTML } from '../utils/dom';
import { matchSelectorRule, type SelectorRule } from '../utils/rules';
import {
  preserveMathInClone,
  extractAIChatThread,
  extractYouTubeTranscript,
} from '../utils/extractors';

function autoScrollPage(): Promise<void> {
  return new Promise((resolve) => {
    if (!document.body) {
      resolve();
      return;
    }

    let totalHeight = 0;
    const distance = 1000;
    const maxScrollHeight = 20000;
    const startTime = Date.now();
    const maxDurationMs = 4000;

    const timer = setInterval(() => {
      const scrollHeight = document.body?.scrollHeight ?? 0;
      window.scrollBy(0, distance);
      totalHeight += distance;

      if (
        totalHeight >= scrollHeight ||
        totalHeight >= maxScrollHeight ||
        Date.now() - startTime >= maxDurationMs
      ) {
        clearInterval(timer);
        window.scrollTo(0, 0);
        setTimeout(resolve, 200);
      }
    }, 50);
  });
}

async function resolveEffectiveSelectors(request: {
  includeSelector?: string;
  excludeSelectors?: string[];
}): Promise<{ includeSelector?: string; excludeSelectors: string[] }> {
  let includeSelector = request.includeSelector?.trim() || undefined;
  let excludeSelectors = Array.isArray(request.excludeSelectors)
    ? request.excludeSelectors.filter(Boolean)
    : [];

  if (!includeSelector && excludeSelectors.length === 0) {
    try {
      const stored = await chrome.storage.local.get({ selectorRules: [] });
      const matched = matchSelectorRule(
        window.location.hostname,
        (stored.selectorRules as SelectorRule[]) || []
      );
      if (matched) {
        includeSelector = matched.includeSelector?.trim() || undefined;
        excludeSelectors = matched.excludeSelectors || [];
      }
    } catch {
      // Storage may be unavailable in restricted contexts
    }
  }

  return { includeSelector, excludeSelectors };
}

function buildScopedClone(includeSelector?: string, excludeSelectors: string[] = []): Document {
  const documentClone = document.cloneNode(true) as Document;

  for (const selector of excludeSelectors) {
    try {
      documentClone.querySelectorAll(selector).forEach((el) => el.remove());
    } catch {
      // Ignore invalid CSS selector
    }
  }

  if (includeSelector && documentClone.body) {
    try {
      const target = documentClone.querySelector(includeSelector);
      if (target) {
        documentClone.body.innerHTML = '';
        documentClone.body.appendChild(target.cloneNode(true));
      }
    } catch {
      // Ignore invalid CSS selector
    }
  }

  return documentClone;
}

function toggleReaderOverlay(title: string, sanitizedHtml: string, plainText: string): boolean {
  const existing = document.getElementById('pagescribe-reader-host');
  if (existing) {
    window.speechSynthesis?.cancel();
    existing.remove();
    return false;
  }

  const host = document.createElement('div');
  host.id = 'pagescribe-reader-host';
  host.style.cssText = 'position:fixed;inset:0;z-index:2147483647;';
  const shadow = host.attachShadow({ mode: 'open' });

  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .overlay {
        position: fixed; inset: 0; overflow-y: auto;
        background: #fafaf9; color: #1c1917;
        font-family: Georgia, 'Times New Roman', serif;
        padding: 24px 16px 64px;
      }
      .overlay.dark { background: #18181b; color: #f4f4f5; }
      .toolbar {
        position: sticky; top: 0; max-width: 740px; margin: 0 auto 24px;
        display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
        padding: 10px 14px; border-radius: 10px;
        background: rgba(255,255,255,0.92); border: 1px solid #e7e5e4;
        font-family: system-ui, sans-serif; font-size: 13px;
        backdrop-filter: blur(8px);
      }
      .overlay.dark .toolbar { background: rgba(39,39,42,0.92); border-color: #3f3f46; }
      button {
        padding: 5px 10px; border-radius: 6px; border: 1px solid #d6d3d1;
        background: #fff; color: #1c1917; cursor: pointer; font-weight: 600;
      }
      .overlay.dark button { background: #27272a; color: #f4f4f5; border-color: #52525b; }
      .article { max-width: 700px; margin: 0 auto; font-size: 18px; line-height: 1.75; }
      .article h1 { font-size: 2em; line-height: 1.2; margin-bottom: 0.6em; }
      .article img { max-width: 100%; height: auto; border-radius: 8px; }
      .article pre { overflow-x: auto; padding: 12px; border-radius: 8px; background: #27272a; color: #f4f4f5; }
    </style>
    <div class="overlay" id="ps-ov">
      <div class="toolbar">
        <strong>PageScribe Reader</strong>
        <button id="ps-smaller">A-</button>
        <button id="ps-larger">A+</button>
        <button id="ps-theme">Dark / Light</button>
        <button id="ps-speak">Read Aloud</button>
        <button id="ps-stop">Stop Audio</button>
        <button id="ps-close" style="margin-left:auto;">Close</button>
      </div>
      <article class="article" id="ps-art">
        <h1></h1>
        <div id="ps-body"></div>
      </article>
    </div>
  `;

  const ov = shadow.getElementById('ps-ov')!;
  const art = shadow.getElementById('ps-art')!;
  shadow.querySelector('#ps-art h1')!.textContent = title || 'Reader Mode';
  shadow.getElementById('ps-body')!.innerHTML = sanitizedHtml;

  let fontSize = 18;
  shadow.getElementById('ps-smaller')!.onclick = () => {
    fontSize = Math.max(13, fontSize - 2);
    art.style.fontSize = `${fontSize}px`;
  };
  shadow.getElementById('ps-larger')!.onclick = () => {
    fontSize = Math.min(28, fontSize + 2);
    art.style.fontSize = `${fontSize}px`;
  };
  shadow.getElementById('ps-theme')!.onclick = () => ov.classList.toggle('dark');
  shadow.getElementById('ps-speak')!.onclick = () => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(plainText.slice(0, 15000));
    window.speechSynthesis.speak(utter);
  };
  shadow.getElementById('ps-stop')!.onclick = () => window.speechSynthesis?.cancel();
  shadow.getElementById('ps-close')!.onclick = () => {
    window.speechSynthesis?.cancel();
    host.remove();
  };

  document.documentElement.appendChild(host);
  return true;
}

export default defineContentScript({
  matches: ['<all_urls>'],
  registration: 'runtime',
  main() {
    const turndownService = new TurndownService({
      headingStyle: 'atx',
      codeBlockStyle: 'fenced',
    });
    turndownService.use(gfm);

    chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
      (async () => {
        try {
          if (request.action === 'extractContent') {
            if (request.autoScroll) {
              await autoScrollPage();
            }

            const metadata = parseDOMMetadata(document);

            // 1. Site-specific AI Chat Thread extractor
            const chatThread = extractAIChatThread(document, window.location.hostname, turndownService);
            if (chatThread) {
              sendResponse({
                markdown: chatThread.markdown,
                title: chatThread.title,
                content: chatThread.text,
                html: sanitizeHTML(chatThread.markdown),
                ...metadata,
                metadata,
              });
              return;
            }

            // 2. YouTube Transcript & Chapter extractor
            const ytTranscript = await extractYouTubeTranscript(document, window.location.href);
            if (ytTranscript) {
              sendResponse({
                markdown: ytTranscript.markdown,
                title: ytTranscript.title,
                content: ytTranscript.text,
                html: sanitizeHTML(ytTranscript.markdown),
                ...metadata,
                metadata,
              });
              return;
            }

            const { includeSelector, excludeSelectors } = await resolveEffectiveSelectors(request);
            const scopedClone = buildScopedClone(includeSelector, excludeSelectors);
            preserveMathInClone(scopedClone);

            let article: ReturnType<Readability['parse']> = null;
            try {
              article = new Readability(scopedClone).parse();
            } catch (readabilityErr) {
              console.warn('Readability failed, falling back to body:', readabilityErr);
            }

            if (article && article.content) {
              const sanitizedHtml = sanitizeHTML(article.content);
              const markdown = turndownService.turndown(sanitizedHtml);
              sendResponse({
                markdown,
                title: article.title || document.title || 'Untitled',
                content: article.textContent || '',
                html: sanitizedHtml,
                ...metadata,
                metadata,
              });
            } else {
              const rawBodyHtml = scopedClone.body?.innerHTML || '';
              const sanitizedHtml = sanitizeHTML(rawBodyHtml);
              const fallbackMarkdown = sanitizedHtml
                ? turndownService.turndown(sanitizedHtml)
                : '';
              sendResponse({
                markdown: fallbackMarkdown,
                title: document.title || 'Untitled',
                content: scopedClone.body?.textContent || '',
                html: sanitizedHtml,
                ...metadata,
                metadata,
              });
            }
          } else if (request.action === 'extractLinks') {
            const links = Array.from(document.querySelectorAll('a[href]'))
              .map((a) => a.getAttribute('href'))
              .filter((href): href is string => Boolean(href && href.trim()));
            sendResponse(links);
          } else if (request.action === 'highlightSelection') {
            const selection = window.getSelection();
            const text = selection?.toString().trim() || '';
            if (selection && selection.rangeCount > 0 && text) {
              try {
                const range = selection.getRangeAt(0);
                const mark = document.createElement('mark');
                mark.className = 'pagescribe-highlight';
                mark.style.backgroundColor = '#fef08a';
                mark.style.color = '#111827';
                mark.style.padding = '0 2px';
                mark.style.borderRadius = '2px';
                range.surroundContents(mark);
                selection.removeAllRanges();
              } catch {
                // Cross-node selection fallback: still return the selected text
              }
            }
            sendResponse({ text });
          } else if (request.action === 'toggleReaderMode') {
            const scopedClone = buildScopedClone();
            preserveMathInClone(scopedClone);
            let article: ReturnType<Readability['parse']> = null;
            try {
              article = new Readability(scopedClone).parse();
            } catch {
              // Fallback to body
            }
            const rawHtml = article?.content || document.body?.innerHTML || '';
            const cleanHtml = sanitizeHTML(rawHtml);
            const plain = article?.textContent || document.body?.textContent || '';
            const active = toggleReaderOverlay(
              article?.title || document.title || 'Reader Mode',
              cleanHtml,
              plain
            );
            sendResponse({ active });
          } else {
            sendResponse({ error: `Unknown content action: ${request.action}` });
          }
        } catch (err) {
          console.error('Content script error:', err);
          sendResponse({
            error: err instanceof Error ? err.message : 'Failed to extract content',
          });
        }
      })();
      return true;
    });
  },
});
