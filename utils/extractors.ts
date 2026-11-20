import type TurndownService from 'turndown';

/**
 * Converts KaTeX, MathJax, and MathML nodes into plain $...$ / $$...$$ text nodes
 * before Turndown converts HTML to Markdown.
 */
export function preserveMathInClone(doc: Document): void {
  // 1. KaTeX: <span class="katex">...<annotation encoding="application/x-tex">...</annotation></span>
  doc.querySelectorAll('.katex-display, .katex').forEach((el) => {
    // Skip inner .katex if already handled via .katex-display
    if (!el.classList.contains('katex-display') && el.closest('.katex-display')) return;
    const annotation = el.querySelector('annotation[encoding="application/x-tex"]');
    const tex = annotation?.textContent?.trim();
    if (!tex) return;
    const isDisplay = el.classList.contains('katex-display');
    const replacement = doc.createTextNode(isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`);
    el.replaceWith(replacement);
  });

  // 2. MathJax script tags: <script type="math/tex"> or <script type="math/tex; mode=display">
  doc.querySelectorAll('script[type^="math/tex"]').forEach((scriptEl) => {
    const tex = scriptEl.textContent?.trim();
    if (!tex) return;
    const isDisplay = (scriptEl.getAttribute('type') || '').includes('display');
    const replacement = doc.createTextNode(isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`);
    scriptEl.replaceWith(replacement);
  });

  // 3. Generic <math alttext="...">
  doc.querySelectorAll('math[alttext]').forEach((mathEl) => {
    const tex = mathEl.getAttribute('alttext')?.trim();
    if (!tex) return;
    const isDisplay = mathEl.getAttribute('display') === 'block';
    const replacement = doc.createTextNode(isDisplay ? `\n$$\n${tex}\n$$\n` : `$${tex}$`);
    mathEl.replaceWith(replacement);
  });
}

export interface ChatTurn {
  role: 'User' | 'Assistant';
  markdown: string;
}

const AI_CHAT_HOSTS: Record<
  string,
  {
    turnSelector: string;
    detectRole: (el: Element, index: number) => 'User' | 'Assistant';
    contentSelector?: string;
  }
> = {
  'chatgpt.com': {
    turnSelector: '[data-message-author-role]',
    detectRole: (el) =>
      el.getAttribute('data-message-author-role') === 'user' ? 'User' : 'Assistant',
    contentSelector: '.markdown, .whitespace-pre-wrap',
  },
  'chat.openai.com': {
    turnSelector: '[data-message-author-role]',
    detectRole: (el) =>
      el.getAttribute('data-message-author-role') === 'user' ? 'User' : 'Assistant',
    contentSelector: '.markdown, .whitespace-pre-wrap',
  },
  'claude.ai': {
    turnSelector: '[data-testid="user-message"], [data-is-streaming], .font-claude-message',
    detectRole: (el) =>
      el.getAttribute('data-testid') === 'user-message' ? 'User' : 'Assistant',
  },
  'gemini.google.com': {
    turnSelector: 'user-query, model-response',
    detectRole: (el) => (el.tagName.toLowerCase() === 'user-query' ? 'User' : 'Assistant'),
  },
  'perplexity.ai': {
    turnSelector: '[data-testid="user-query"], .prose',
    detectRole: (el, i) =>
      el.getAttribute('data-testid') === 'user-query' || i % 2 === 0 ? 'User' : 'Assistant',
  },
};

export function extractAIChatThread(
  doc: Document,
  hostname: string,
  turndownService: TurndownService
): { title: string; markdown: string; text: string; turns: ChatTurn[] } | null {
  const cleanHost = (hostname || '').toLowerCase().replace(/^www\./, '');
  const adapter = AI_CHAT_HOSTS[cleanHost];
  if (!adapter) return null;

  const nodes = Array.from(doc.querySelectorAll(adapter.turnSelector));
  if (nodes.length === 0) return null;

  const turns: ChatTurn[] = [];
  nodes.forEach((node, idx) => {
    const role = adapter.detectRole(node, idx);
    const contentNode =
      (adapter.contentSelector ? node.querySelector(adapter.contentSelector) : null) || node;
    const html = contentNode.innerHTML || '';
    const md = turndownService.turndown(html).trim();
    if (md) {
      turns.push({ role, markdown: md });
    }
  });

  if (turns.length === 0) return null;

  const title = doc.title || `${cleanHost} Conversation`;
  const markdown = turns
    .map((t) => `## ${t.role}\n\n${t.markdown}`)
    .join('\n\n---\n\n');
  const text = turns.map((t) => `${t.role}: ${t.markdown}`).join('\n\n');

  return { title, markdown, text, turns };
}

export function formatSecondsToTimestamp(totalSeconds: number): string {
  const secs = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const pad = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export async function extractYouTubeTranscript(
  doc: Document,
  pageUrl: string
): Promise<{ title: string; markdown: string; text: string } | null> {
  let host = '';
  try {
    host = new URL(pageUrl).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (host !== 'youtube.com' && host !== 'm.youtube.com') return null;

  const title =
    doc.querySelector('h1.ytd-watch-metadata yt-formatted-string')?.textContent?.trim() ||
    doc.title.replace(/\s*-\s*YouTube$/, '').trim() ||
    'YouTube Video';

  // 1. Try DOM transcript segments if transcript panel is open
  const domSegments = Array.from(doc.querySelectorAll('ytd-transcript-segment-renderer'));
  if (domSegments.length > 0) {
    const lines: string[] = [];
    const plainLines: string[] = [];
    for (const seg of domSegments) {
      const ts = seg.querySelector('.segment-timestamp')?.textContent?.trim() || '0:00';
      const txt = seg.querySelector('.segment-text')?.textContent?.trim() || '';
      if (txt) {
        const parts = ts.split(':').map((n) => parseInt(n, 10) || 0);
        const seconds =
          parts.length === 3
            ? parts[0] * 3600 + parts[1] * 60 + parts[2]
            : (parts[0] || 0) * 60 + (parts[1] || 0);
        const link = `${pageUrl.split('&t=')[0]}&t=${seconds}s`;
        lines.push(`- **[${ts}](${link})** ${txt}`);
        plainLines.push(`[${ts}] ${txt}`);
      }
    }
    if (lines.length > 0) {
      return {
        title,
        markdown: `## Transcript\n\n${lines.join('\n')}`,
        text: plainLines.join('\n'),
      };
    }
  }

  // 2. Fallback: parse captionTracks from inline page scripts
  const scripts = Array.from(doc.querySelectorAll('script'));
  for (const s of scripts) {
    const text = s.textContent || '';
    const match = text.match(/"captionTracks":(\[.*?\])/);
    if (match) {
      try {
        const tracks = JSON.parse(match[1]) as Array<{ baseUrl?: string; languageCode?: string }>;
        const track = tracks.find((t) => t.languageCode?.startsWith('en')) || tracks[0];
        if (track?.baseUrl) {
          const res = await fetch(`${track.baseUrl}&fmt=json3`);
          if (res.ok) {
            const json = (await res.json()) as {
              events?: Array<{ tStartMs?: number; segs?: Array<{ utf8?: string }> }>;
            };
            const lines: string[] = [];
            const plain: string[] = [];
            for (const ev of json.events || []) {
              const phrase = (ev.segs || [])
                .map((seg) => seg.utf8 || '')
                .join('')
                .replace(/\s+/g, ' ')
                .trim();
              if (!phrase) continue;
              const secs = Math.floor((ev.tStartMs || 0) / 1000);
              const ts = formatSecondsToTimestamp(secs);
              lines.push(`- **[${ts}](${pageUrl.split('&t=')[0]}&t=${secs}s)** ${phrase}`);
              plain.push(`[${ts}] ${phrase}`);
            }
            if (lines.length > 0) {
              return {
                title,
                markdown: `## Transcript\n\n${lines.join('\n')}`,
                text: plain.join('\n'),
              };
            }
          }
        }
      } catch {
        // Ignore malformed caption JSON
      }
    }
  }

  return null;
}
