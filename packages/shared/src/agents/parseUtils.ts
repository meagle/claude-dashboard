export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export function normalizeText(raw: string, max = 240): string | null {
  const t = raw.trim().replace(/\s+/g, ' ');
  if (t.length === 0) return null;
  return truncate(t, max);
}

export function computeContextPct(tokens: number, windowSize: number): number | null {
  if (tokens <= 0 || windowSize <= 0) return null;
  return Math.min(100, Math.round((tokens / windowSize) * 100));
}

export function safeParseLines(content: string): string[] {
  return content.split('\n').filter(Boolean);
}
