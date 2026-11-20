import { describe, expect, test } from 'bun:test';
import { parseSitemapXml, parseFeedXml } from '../utils/feeds';
import { createZipArchive } from '../utils/zip';
import { suggestTagsAndWikiLinks } from '../utils/graph';
import { computeLineDiff, stripHtmlToComparableText } from '../utils/watcher';
import { formatSecondsToTimestamp } from '../utils/extractors';

describe('Sitemap & Feed Discovery', () => {
  test('parses sitemap.xml URLs', () => {
    const xml = `
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url><loc>https://example.com/docs/intro</loc></url>
        <url><loc>https://example.com/docs/api</loc></url>
      </urlset>
    `;
    expect(parseSitemapXml(xml)).toEqual([
      'https://example.com/docs/intro',
      'https://example.com/docs/api',
    ]);
  });

  test('parses RSS and Atom feeds', () => {
    const rss = `<rss><channel><item><title>Post 1</title><link>https://example.com/p1</link></item></channel></rss>`;
    const atom = `<feed><entry><title>Atom 1</title><link href="https://example.com/a1" /></entry></feed>`;
    expect(parseFeedXml(rss)).toEqual([{ url: 'https://example.com/p1', title: 'Post 1' }]);
    expect(parseFeedXml(atom)).toEqual([{ url: 'https://example.com/a1', title: 'Atom 1' }]);
  });
});

describe('ZIP Archive Builder', () => {
  test('creates valid ZIP header and EOCD signature', () => {
    const data = new TextEncoder().encode('# Hello ZIP');
    const zip = createZipArchive([{ name: 'note.md', data }]);
    // Local file header PK\x03\x04
    expect(zip[0]).toBe(0x50);
    expect(zip[1]).toBe(0x4b);
    expect(zip[2]).toBe(0x03);
    expect(zip[3]).toBe(0x04);
    expect(zip.length).toBeGreaterThan(data.length + 50);
  });
});

describe('Auto-Tagging & WikiLink Graph', () => {
  test('generates clean tags and matches known vault note titles', () => {
    const res = suggestTagsAndWikiLinks(
      ['TypeScript (5)', 'Obsidian (3)', 'AI (1)'],
      'This article covers TypeScript patterns and Obsidian knowledge graphs.',
      ['TypeScript', 'Obsidian', 'Unrelated Note']
    );
    expect(res.tags).toEqual(['typescript', 'obsidian']);
    expect(res.wikiLinks).toEqual(['[[TypeScript]]', '[[Obsidian]]']);
  });
});

describe('Page Change Watcher Diff', () => {
  test('detects added and removed lines', () => {
    const diff = computeLineDiff('Line A\nLine B', 'Line A\nLine C');
    expect(diff.changed).toBe(true);
    expect(diff.added).toEqual(['Line C']);
    expect(diff.removed).toEqual(['Line B']);
    expect(stripHtmlToComparableText('<div><p>Hello</p><script>x()</script></div>')).toBe('Hello');
  });
});

describe('YouTube Timestamp Formatter', () => {
  test('formats seconds into mm:ss and h:mm:ss', () => {
    expect(formatSecondsToTimestamp(65)).toBe('01:05');
    expect(formatSecondsToTimestamp(3661)).toBe('1:01:01');
  });
});
