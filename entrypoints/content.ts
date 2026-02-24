import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';

function sanitizeHTML(html: string): string {
  const doc = document.implementation.createHTMLDocument('');
  const div = doc.createElement('div');
  div.innerHTML = html;

  // Remove script elements
  const scripts = div.querySelectorAll('script');
  scripts.forEach((s) => s.remove());

  // Remove other potentially dangerous elements
  const dangerousElements = div.querySelectorAll('object, embed, link, meta, base, form');
  dangerousElements.forEach((el) => el.remove());

  // Remove event handlers and dangerous attributes
  const allElements = div.querySelectorAll('*');
  allElements.forEach((el) => {
    const attrs = el.attributes;
    for (let i = attrs.length - 1; i >= 0; i--) {
      const attrName = attrs[i].name.toLowerCase();
      if (attrName.startsWith('on') ||
          attrName === 'formaction' ||
          attrName === 'action') {
        el.removeAttribute(attrs[i].name);
      }
    }
    // Sanitize hrefs
    if (el.tagName === 'A' || el.tagName === 'AREA') {
      const href = el.getAttribute('href');
      if (href && href.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute('href');
      }
    }
    // Sanitize src
    const srcTags = ['IMG', 'IFRAME', 'VIDEO', 'AUDIO', 'SOURCE', 'TRACK'];
    if (srcTags.includes(el.tagName)) {
      const src = el.getAttribute('src');
      if (src && src.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute('src');
      }
    }
  });

  return div.innerHTML;
}

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