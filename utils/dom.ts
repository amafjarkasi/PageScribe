export function escapeHTML(str: string): string {
  return str.replace(/[&<>'"]/g,
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

export function sanitizeHTML(html: string): string {
  if (typeof document === 'undefined') {
    return escapeHTML(html); // Fallback for environments without DOM
  }
  const doc = document.implementation.createHTMLDocument('');
  doc.body.innerHTML = html;

  // Basic sanitization: remove script, iframe, object, embed tags
  const tagsToRemove = ['script', 'iframe', 'object', 'embed', 'style', 'link', 'base'];
  tagsToRemove.forEach(tag => {
    const elements = doc.body.getElementsByTagName(tag);
    for (let i = elements.length - 1; i >= 0; i--) {
      elements[i].parentNode?.removeChild(elements[i]);
    }
  });

  // Also remove event handler attributes
  const allElements = doc.body.getElementsByTagName('*');
  for (let i = 0; i < allElements.length; i++) {
    const el = allElements[i];
    const attributes = Array.from(el.attributes);
    for (const attr of attributes) {
      if (attr.name.startsWith('on')) {
        el.removeAttribute(attr.name);
      }
    }
  }

  return doc.body.innerHTML;
}
