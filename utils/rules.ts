export interface SelectorRule {
  domain: string;
  includeSelector?: string;
  excludeSelectors?: string[];
}

export function normalizeDomain(hostname: string): string {
  return (hostname || '').toLowerCase().replace(/^www\./, '');
}

export function matchSelectorRule(
  hostname: string,
  rules: SelectorRule[]
): SelectorRule | undefined {
  const target = normalizeDomain(hostname);
  if (!target || !Array.isArray(rules)) return undefined;

  return rules.find((rule) => {
    const ruleDomain = normalizeDomain(rule.domain);
    return target === ruleDomain || target.endsWith(`.${ruleDomain}`);
  });
}

export function parseSelectorList(input: string): string[] {
  return (input || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
