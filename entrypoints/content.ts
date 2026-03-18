import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { sanitizeHTML } from '../utils/dom';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const turndownService = new TurndownService();

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      (async () => {
      if (request.action === 'extractContent') {

        const autoScroll = () => {
          return new Promise<void>((resolve) => {
            let totalHeight = 0;
            const distance = 1000; // Large jumps for speed
            const timer = setInterval(() => {
              const scrollHeight = document.body.scrollHeight;
              window.scrollBy(0, distance);
              totalHeight += distance;

              if (totalHeight >= scrollHeight || totalHeight > 20000) { // Limit to 20k px
                clearInterval(timer);
                window.scrollTo(0, 0); // Scroll back up
                setTimeout(resolve, 200); // Give time for content to settle
              }
            }, 50); // fast interval
          });
        };

        if (request.autoScroll) {
          await autoScroll();
        }

        const documentClone = document.cloneNode(true) as Document;
        const article = new Readability(documentClone).parse();

        // Extract extra metadata
        const getMeta = (name: string) =>
          document.querySelector(`meta[property="${name}"]`)?.getAttribute('content') ||
          document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') || '';

        const author = getMeta('author') || getMeta('article:author');
        const publishedTime = getMeta('article:published_time');
        const siteName = getMeta('og:site_name');
        const description = getMeta('description') || getMeta('og:description');
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
            html: article.content,
            author, publishedTime, siteName, description
            html: sanitizedHtml
          });
        } else {
          const sanitizedHtml = sanitizeHTML(document.body.innerHTML || '');
          sendResponse({ 
            markdown: '', 
            title: document.title, 
            content: document.body.textContent || '',
            html: document.body.innerHTML || '',
            author: '', publishedTime: '', siteName: '', description: ''
            html: sanitizedHtml
          });
        }
      } else if (request.action === 'extractLinks') {
        const links = Array.from(document.querySelectorAll('a[href]')).map((a) =>
          a.getAttribute('href')
        );
        sendResponse(links);
      }
      })();
      return true;
    });
  },
});
