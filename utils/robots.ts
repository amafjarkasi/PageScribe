export interface RobotsRule {
  allow: string[];
  disallow: string[];
}

/**
 * Parses a robots.txt file and extracts Allow/Disallow rules for User-agent: *.
 */
export function parseRobotsTxt(robotsText: string): RobotsRule {
  const allow: string[] = [];
  const disallow: string[] = [];
  if (!robotsText) return { allow, disallow };

  let inWildcardSection = false;
  let sawAnyUserAgent = false;

  for (const rawLine of robotsText.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (!line) continue;

    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;

    const directive = line.slice(0, colonIdx).trim().toLowerCase();
    const value = line.slice(colonIdx + 1).trim();

    if (directive === 'user-agent') {
      if (sawAnyUserAgent && inWildcardSection && value !== '*') {
        // Leaving wildcard group only if a new non-empty group starts after directives
      }
      inWildcardSection = value === '*';
      sawAnyUserAgent = true;
    } else if (inWildcardSection) {
      if (directive === 'disallow' && value) {
        disallow.push(value);
      } else if (directive === 'allow' && value) {
        allow.push(value);
      }
    }
  }

  return { allow, disallow };
}

function matchesRobotsPattern(pathWithQuery: string, pattern: string): boolean {
  if (!pattern) return false;
  const hasEndAnchor = pattern.endsWith('$');
  const raw = hasEndAnchor ? pattern.slice(0, -1) : pattern;
  const escaped = raw
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${escaped}${hasEndAnchor ? '$' : ''}`);
  return regex.test(pathWithQuery);
}

/**
 * Checks whether a URL is allowed under parsed robots.txt rules.
 * Longest matching rule wins (Allow beats Disallow on equal length).
 */
export function isUrlAllowedByRobots(targetUrl: string, rules: RobotsRule): boolean {
  if (rules.disallow.length === 0) return true;

  let pathWithQuery = '/';
  try {
    const parsed = new URL(targetUrl);
    pathWithQuery = `${parsed.pathname}${parsed.search}`;
  } catch {
    return true;
  }

  let bestAllowLen = -1;
  for (const pattern of rules.allow) {
    if (matchesRobotsPattern(pathWithQuery, pattern)) {
      bestAllowLen = Math.max(bestAllowLen, pattern.length);
    }
  }

  let bestDisallowLen = -1;
  for (const pattern of rules.disallow) {
    if (matchesRobotsPattern(pathWithQuery, pattern)) {
      bestDisallowLen = Math.max(bestDisallowLen, pattern.length);
    }
  }

  if (bestDisallowLen === -1) return true;
  return bestAllowLen >= bestDisallowLen;
}

export async function fetchRobotsRules(origin: string, timeoutMs = 4000): Promise<RobotsRule> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${origin}/robots.txt`, { signal: controller.signal });
    if (!res.ok) return { allow: [], disallow: [] };
    const text = await res.text();
    return parseRobotsTxt(text);
  } catch {
    return { allow: [], disallow: [] };
  } finally {
    clearTimeout(timer);
  }
}
