import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

export default defineContentScript({
  matches: ['<all_urls>'],
  main() {
    const turndownService = new TurndownService();

    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
      if (request.action === 'extractContent') {
        const documentClone = document.cloneNode(true) as Document;
        const article = new Readability(documentClone).parse();

        if (article && article.content) {
          const markdown = turndownService.turndown(article.content);
          sendResponse({
            markdown: markdown,
            title: article.title, 
            content: article.textContent,
            html: article.content 
          });
        } else {
          sendResponse({ 
            markdown: '', 
            title: document.title, 
            content: document.body.textContent || '',
            html: document.body.innerHTML || ''
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