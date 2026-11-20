import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { parseDOMMetadata, sanitizeHTML } from '../utils/dom';
import { matchSelectorRule, type SelectorRule } from '../utils/rules';

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
            const { includeSelector, excludeSelectors } = await resolveEffectiveSelectors(request);
            const scopedClone = buildScopedClone(includeSelector, excludeSelectors);

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
