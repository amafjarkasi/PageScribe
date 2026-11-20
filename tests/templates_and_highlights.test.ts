import { describe, expect, test } from 'bun:test';
import { BUILTIN_TEMPLATES, buildObsidianUri, renderTemplate } from '../utils/templates';
import { formatHighlightsMarkdown, normalizeHighlightUrl } from '../utils/highlights';

describe('Clip Templates & Obsidian URI', () => {
  test('renders template variables and highlights cleanly', () => {
    const obsidianTpl = BUILTIN_TEMPLATES.find((t) => t.id === 'obsidian')!;
    const out = renderTemplate(obsidianTpl.body, {
      title: 'My Article',
      url: 'https://example.com/post',
      author: 'Ada',
      date: '2026-11-20',
      site: 'Example',
      description: 'Desc',
      language: 'English',
      wordCount: 120,
      readingTime: 1,
      keywords: 'ai, markdown',
      summary: 'Short summary.',
      highlights: '> Key quote',
      content: 'Body text',
    });

    expect(out).toContain('title: "My Article"');
    expect(out).toContain('> **Summary:** Short summary.');
    expect(out).toContain('## Highlights\n\n> Key quote');
    expect(out).toContain('Body text');
  });

  test('builds valid obsidian://new URI', () => {
    const uri = buildObsidianUri('SecondBrain', 'Test: Note?', '# Hello');
    expect(uri.startsWith('obsidian://new?')).toBe(true);
    expect(uri).toContain('vault=SecondBrain');
    expect(uri).toContain('file=Test_+Note_');
  });
});

describe('Highlights helpers', () => {
  test('normalizes URL by stripping hash', () => {
    expect(normalizeHighlightUrl('https://example.com/a#section')).toBe('https://example.com/a');
  });

  test('formats highlights as blockquotes', () => {
    const md = formatHighlightsMarkdown([
      { id: '1', url: 'https://example.com', text: 'First quote', createdAt: 1 },
      { id: '2', url: 'https://example.com', text: 'Second quote', note: 'Important', createdAt: 2 },
    ]);
    expect(md).toContain('> First quote');
    expect(md).toContain('> Second quote\n\n*Note:* Important');
  });
});
