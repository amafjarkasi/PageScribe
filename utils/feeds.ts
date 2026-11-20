export interface DiscoveredUrl {
  url: string;
  title?: string;
}

export function parseSitemapXml(xml: string): string[] {
  if (!xml) return [];
  const urls: string[] = [];
  const locRegex = /<loc>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/loc>/gi;
  let match: RegExpExecArray | null;
  while ((match = locRegex.exec(xml)) !== null) {
    const u = match[1].trim();
    if (/^https?:\/\//i.test(u)) {
      urls.push(u);
    }
  }
  return [...new Set(urls)];
}

export function parseFeedXml(xml: string): DiscoveredUrl[] {
  if (!xml) return [];
  const items: DiscoveredUrl[] = [];
  const seen = new Set<string>();

  // RSS <item>
  const itemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let itemMatch: RegExpExecArray | null;
  while ((itemMatch = itemRegex.exec(xml)) !== null) {
    const block = itemMatch[1];
    const linkMatch = block.match(/<link>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/link>/i);
    const titleMatch = block.match(/<title>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/title>/i);
    const url = linkMatch?.[1]?.trim();
    if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url);
      items.push({ url, title: titleMatch?.[1]?.trim() });
    }
  }

  // Atom <entry>
  const entryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
  let entryMatch: RegExpExecArray | null;
  while ((entryMatch = entryRegex.exec(xml)) !== null) {
    const block = entryMatch[1];
    const hrefMatch = block.match(/<link[^>]+href=["']([^"']+)["'][^>]*>/i);
    const titleMatch = block.match(/<title[^>]*>\s*(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?\s*<\/title>/i);
    const url = hrefMatch?.[1]?.trim();
    if (url && /^https?:\/\//i.test(url) && !seen.has(url)) {
      seen.add(url);
      items.push({ url, title: titleMatch?.[1]?.trim() });
    }
  }

  return items;
}

export async function discoverSiteUrls(
  origin: string,
  candidates: string[] = ['/sitemap.xml', '/rss.xml', '/feed.xml', '/atom.xml']
): Promise<DiscoveredUrl[]> {
  const discovered: DiscoveredUrl[] = [];
  const seen = new Set<string>();

  for (const pathOrUrl of candidates) {
    const targetUrl = pathOrUrl.startsWith('http') ? pathOrUrl : `${origin}${pathOrUrl}`;
    try {
      const res = await fetch(targetUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      if (xml.includes('<urlset') || xml.includes('<sitemapindex')) {
        for (const u of parseSitemapXml(xml)) {
          if (!seen.has(u)) {
            seen.add(u);
            discovered.push({ url: u });
          }
        }
      }
      if (xml.includes('<rss') || xml.includes('<feed')) {
        for (const entry of parseFeedXml(xml)) {
          if (!seen.has(entry.url)) {
            seen.add(entry.url);
            discovered.push(entry);
          }
        }
      }
      if (discovered.length >= 100) break;
    } catch {
      // Ignore unreachable feed/sitemap candidate
    }
  }

  return discovered.slice(0, 200);
}
