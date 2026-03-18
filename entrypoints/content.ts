import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { sanitizeHTML } from '../utils/dom';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const turndownService = new TurndownService();

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractContent') {
        const documentClone = document.cloneNode(true) as Document;
        const article = new Readability(documentClone).parse();

        if (article && article.content) {
          const sanitizedHtml = sanitizeHTML(article.content);
          const markdown = turndownService.turndown(sanitizedHtml);
          sendResponse({
            markdown: markdown,
            title: article.title, 
            content: article.textContent,
            html: sanitizedHtml
          });
        } else {
          const sanitizedHtml = sanitizeHTML(document.body.innerHTML || '');
          sendResponse({ 
            markdown: '', 
            title: document.title, 
            content: document.body.textContent || '',
            html: sanitizedHtml
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
