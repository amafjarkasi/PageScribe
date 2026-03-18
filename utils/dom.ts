export function sanitizeHTML(html: string): string {
  if (!html) return '';

  const doc = document.implementation.createHTMLDocument('');
  const div = doc.createElement('div');
  div.innerHTML = html;

  // Remove dangerous elements
  const dangerousElements = div.querySelectorAll('script, object, embed, link, meta, base, form, iframe, frame, frameset, noscript, style');
  dangerousElements.forEach((el) => el.remove());

  // Remove event handlers and dangerous attributes
  const allElements = div.querySelectorAll('*');
  allElements.forEach((el) => {
    const attrs = el.attributes;
    for (let i = attrs.length - 1; i >= 0; i--) {
      const attrName = attrs[i].name.toLowerCase();
      if (attrName.startsWith('on') ||
          ['formaction', 'action', 'data', 'codebase', 'manifest', 'srcdoc'].includes(attrName)) {
        el.removeAttribute(attrs[i].name);
      }
    }

    // Sanitize URL attributes
    const urlAttrs = ['href', 'src', 'poster'];
    urlAttrs.forEach(attr => {
      const val = el.getAttribute(attr);
      if (val && val.trim().toLowerCase().startsWith('javascript:')) {
        el.removeAttribute(attr);
      }
    });
  });

  return div.innerHTML;
}
