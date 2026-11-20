export interface ClipTemplate {
  id: string;
  name: string;
  body: string;
}

export interface TemplateVariables {
  title: string;
  url: string;
  author: string;
  date: string;
  site: string;
  description: string;
  language: string;
  wordCount: number;
  readingTime: number;
  keywords: string;
  summary: string;
  highlights: string;
  content: string;
}

export const BUILTIN_TEMPLATES: ClipTemplate[] = [
  {
    id: 'default',
    name: 'Standard Frontmatter',
    body: `---
title: "{{title}}"
url: "{{url}}"
author: "{{author}}"
date: "{{date}}"
site: "{{site}}"
description: "{{description}}"
---

# {{title}}

{{highlights}}
{{content}}`,
  },
  {
    id: 'obsidian',
    name: 'Obsidian Research Note',
    body: `---
title: "{{title}}"
source: "{{url}}"
author: "{{author}}"
published: "{{date}}"
clipped: "{{clippedDate}}"
language: "{{language}}"
words: {{wordCount}}
tags: [clipped, pagescribe]
---

# {{title}}

> **Summary:** {{summary}}

**Keywords:** {{keywords}}

{{highlights}}
## Content

{{content}}`,
  },
  {
    id: 'minimal',
    name: 'Minimal Clean Markdown',
    body: `# {{title}}

Source: {{url}}

{{content}}`,
  },
];

export function renderTemplate(templateBody: string, vars: TemplateVariables): string {
  const clippedDate = new Date().toISOString().split('T')[0];
  const map: Record<string, string> = {
    title: vars.title || 'Untitled',
    url: vars.url || '',
    author: vars.author || '',
    date: vars.date || '',
    clippedDate,
    site: vars.site || '',
    description: vars.description || '',
    language: vars.language || 'English',
    wordCount: String(vars.wordCount ?? 0),
    readingTime: String(vars.readingTime ?? 0),
    keywords: vars.keywords || '',
    summary: vars.summary || '',
    highlights: vars.highlights ? `## Highlights\n\n${vars.highlights}\n` : '',
    content: vars.content || '',
  };

  return templateBody.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
    return key in map ? map[key] : '';
  });
}

export function buildObsidianUri(vault: string, title: string, content: string): string {
  const cleanTitle = (title || 'PageScribe Note').replace(/[\\/:*?"<>|]/g, '_').slice(0, 100);
  const params = new URLSearchParams();
  if (vault?.trim()) params.set('vault', vault.trim());
  params.set('file', cleanTitle);
  params.set('content', content);
  return `obsidian://new?${params.toString()}`;
}
