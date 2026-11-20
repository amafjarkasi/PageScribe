export interface GraphSuggestions {
  tags: string[];
  wikiLinks: string[];
}

export function suggestTagsAndWikiLinks(
  keywords: string[],
  contentText: string,
  knownNoteTitles: string[]
): GraphSuggestions {
  const tags = Array.from(
    new Set(
      (keywords || [])
        .map((k) =>
          k
            .toLowerCase()
            .replace(/\s*\(\d+\)\s*$/, '')
            .replace(/[^a-z0-9-_]+/g, '-')
            .replace(/^-+|-+$/g, '')
        )
        .filter((t) => t.length >= 3)
    )
  ).slice(0, 8);

  const lowerContent = (contentText || '').toLowerCase();
  const wikiLinks: string[] = [];
  const seenNotes = new Set<string>();

  for (const rawTitle of knownNoteTitles || []) {
    const title = rawTitle.trim();
    if (title.length < 3) continue;
    const lowerTitle = title.toLowerCase();
    if (seenNotes.has(lowerTitle)) continue;

    if (lowerContent.includes(lowerTitle)) {
      seenNotes.add(lowerTitle);
      wikiLinks.push(`[[${title}]]`);
      if (wikiLinks.length >= 10) break;
    }
  }

  return { tags, wikiLinks };
}
