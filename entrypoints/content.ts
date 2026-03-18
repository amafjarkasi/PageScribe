import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { sanitizeHTML } from '../utils/dom';
import { parseDOMMetadata } from '../utils/content';

async function autoScroll() {
  await new Promise<void>((resolve) => {
    let totalHeight = 0;
    const distance = 100;
    const timer = setInterval(() => {
      const scrollHeight = document.body.scrollHeight;
      window.scrollBy(0, distance);
      totalHeight += distance;

      if (totalHeight >= scrollHeight || totalHeight > 10000) {
        clearInterval(timer);
        resolve();
      }
    }, 100);
  });
}

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const turndownService = new TurndownService();

    chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
      if (request.action === 'extractContent') {
        if (request.autoScroll) {
          await autoScroll();
        }
        const documentClone = document.cloneNode(true) as Document;
        const article = new Readability(documentClone).parse();

        const metadata = parseDOMMetadata(document);

        if (article && article.content) {
          const sanitizedHtml = sanitizeHTML(article.content);
          const markdown = turndownService.turndown(sanitizedHtml);
          sendResponse({
            markdown: markdown,
            title: article.title, 
            content: article.textContent,
            html: sanitizedHtml,
            metadata: metadata
          });
        } else {
          const sanitizedHtml = sanitizeHTML(document.body.innerHTML || '');
          sendResponse({ 
            markdown: '', 
            title: document.title, 
            content: document.body.textContent || '',
            html: sanitizedHtml,
            metadata: metadata
          });
        }
      } else if (request.action === 'extractLinks') {
        const links = Array.from(document.querySelectorAll('a[href]')).map((a) =>
          a.getAttribute('href')
        );
        sendResponse(links);
      }
      return true;
    });
  },
});
