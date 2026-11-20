export interface WatchedPage {
  url: string;
  title: string;
  intervalMinutes: number;
  lastChecked: number;
  lastSnapshot: string;
  lastDiffSummary?: string;
  hasUnreadChange?: boolean;
}

export interface LineDiffResult {
  changed: boolean;
  added: string[];
  removed: string[];
  summary: string;
}

export function computeLineDiff(oldText: string, newText: string): LineDiffResult {
  const oldLines = (oldText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const newLines = (newText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);

  const added = newLines.filter((l) => !oldSet.has(l));
  const removed = oldLines.filter((l) => !newSet.has(l));
  const changed = added.length > 0 || removed.length > 0;

  const summary = changed
    ? `+${added.length} added, -${removed.length} removed lines`
    : 'No changes detected';

  return { changed, added, removed, summary };
}

export function stripHtmlToComparableText(html: string): string {
  return (html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}
