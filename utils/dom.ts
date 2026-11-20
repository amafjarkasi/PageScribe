export interface DOMMetadata {
  author: string;
  publishedTime: string;
  siteName: string;
  description: string;
  keywords: string;
  ogImage: string;
}

/**
 * Escapes HTML special characters to prevent injection in HTML templates.
 */
export function escapeHTML(str: string): string {
  if (!str) return '';
  const table: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return str.replace(/[&<>"']/g, (tag) => table[tag] || tag);
}

const DANGEROUS_ELEMENTS_SELECTOR =
  'script, object, embed, link, meta, base, form, iframe, frame, frameset, noscript, style, template';
const DANGEROUS_ATTRS = new Set([
  'formaction',
  'action',
  'data',
  'codebase',
  'manifest',
  'srcdoc',
  'xlink:href',
]);
const URL_ATTRS = ['href', 'src', 'poster', 'action'];
const SAFE_URL_PROTOCOLS = /^(https?:|mailto:|tel:|\/|#|\.)/i;

/**
 * Sanitizes an HTML string using a detached DOM document to strip scripts,
 * event handlers, and unsafe URL protocols.
 */
export function sanitizeHTML(html: string): string {
  if (!html) return '';
  if (typeof document === 'undefined' || !document.implementation) {
    return escapeHTML(html);
  }

  const doc = document.implementation.createHTMLDocument('');
  const div = doc.createElement('div');
  div.innerHTML = html;

  div.querySelectorAll(DANGEROUS_ELEMENTS_SELECTOR).forEach((el) => el.remove());

  div.querySelectorAll('*').forEach((el) => {
    const attrs = el.attributes;
    for (let i = attrs.length - 1; i >= 0; i--) {
      const attrName = attrs[i].name.toLowerCase();
      if (attrName.startsWith('on') || DANGEROUS_ATTRS.has(attrName)) {
        el.removeAttribute(attrs[i].name);
      }
    }

    for (const attr of URL_ATTRS) {
      const val = el.getAttribute(attr);
      if (val !== null) {
        const trimmed = val.trim();
        // Strip control characters/whitespace used to obfuscate javascript: URIs
        const normalized = trimmed.replace(/[\u0000-\u0020]+/g, '');
        if (
          normalized &&
          !SAFE_URL_PROTOCOLS.test(normalized) &&
          !normalized.startsWith('data:image/')
        ) {
          el.removeAttribute(attr);
        }
      }
    }
  });

  return div.innerHTML;
}

/**
 * Extracts standard, Open Graph, and Twitter metadata from a Document.
 */
export function parseDOMMetadata(doc: Document): DOMMetadata {
  const getMeta = (names: string[]): string => {
    for (const name of names) {
      const el =
        doc.querySelector(`meta[property="${name}"]`) ||
        doc.querySelector(`meta[name="${name}"]`);
      const content = el?.getAttribute('content')?.trim();
      if (content) return content;
    }
    return '';
  };

  return {
    author: getMeta(['author', 'article:author', 'twitter:creator']),
    publishedTime: getMeta(['article:published_time', 'datePublished', 'pubdate']),
    siteName: getMeta(['og:site_name', 'application-name']),
    description: getMeta(['description', 'og:description', 'twitter:description']),
    keywords: getMeta(['keywords']),
    ogImage: getMeta(['og:image', 'twitter:image']),
  };
}
