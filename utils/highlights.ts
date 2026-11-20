export interface PageHighlight {
  id: string;
  url: string;
  text: string;
  note?: string;
  createdAt: number;
}

export function normalizeHighlightUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = '';
    return parsed.href;
  } catch {
    return rawUrl || '';
  }
}

export function formatHighlightsMarkdown(highlights: PageHighlight[]): string {
  if (!highlights || highlights.length === 0) return '';
  return highlights
    .map((h) => {
      const quote = `> ${h.text.replace(/\r?\n/g, '\n> ')}`;
      return h.note ? `${quote}\n\n*Note:* ${h.note}` : quote;
    })
    .join('\n\n');
}
