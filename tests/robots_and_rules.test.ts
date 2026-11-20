import { describe, expect, test } from 'bun:test';
import { parseRobotsTxt, isUrlAllowedByRobots } from '../utils/robots';
import { matchSelectorRule, parseSelectorList } from '../utils/rules';
import { askWithAI, DEFAULT_AI_CONFIG } from '../utils/llm';

describe('robots.txt parser', () => {
  test('respects User-agent * Allow and Disallow directives', () => {
    const robots = `
      User-agent: *
      Disallow: /admin/
      Disallow: /private
      Allow: /admin/public
    `;
    const rules = parseRobotsTxt(robots);
    expect(isUrlAllowedByRobots('https://example.com/blog/post-1', rules)).toBe(true);
    expect(isUrlAllowedByRobots('https://example.com/admin/users', rules)).toBe(false);
    expect(isUrlAllowedByRobots('https://example.com/admin/public', rules)).toBe(true);
    expect(isUrlAllowedByRobots('https://example.com/private/secret', rules)).toBe(false);
  });
});

describe('Selector rules', () => {
  test('matches exact and subdomain hostnames', () => {
    const rules = [
      { domain: 'docs.example.com', includeSelector: 'main', excludeSelectors: ['.nav'] },
      { domain: 'example.org', includeSelector: 'article' },
    ];
    expect(matchSelectorRule('www.docs.example.com', rules)?.includeSelector).toBe('main');
    expect(matchSelectorRule('sub.example.org', rules)?.includeSelector).toBe('article');
    expect(matchSelectorRule('other.com', rules)).toBeUndefined();
  });

  test('parses comma-separated selector lists', () => {
    expect(parseSelectorList('.ads, nav,  .sidebar ')).toEqual(['.ads', 'nav', '.sidebar']);
  });
});

describe('Offline AI Q&A fallback', () => {
  test('returns matching excerpts when provider is offline', async () => {
    const context = 'PageScribe extracts clean Markdown from web pages. It also supports crawling.';
    const res = await askWithAI('How does PageScribe handle Markdown?', context, DEFAULT_AI_CONFIG);
    expect(res.usedProvider).toBe('offline');
    expect(res.answer).toContain('Markdown');
  });
});
