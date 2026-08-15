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

// Shared by claude-code and cursor descriptors (cursor transcripts never carry a model id,
// but the descriptor still calls this from the payload-derived fallback path in hook.ts).
// Model IDs use dashes: claude-sonnet-4-6, claude-haiku-4-5-20251001
export function modelDisplayName(modelId: string): string {
  const m = modelId.match(/(\d+)-(\d+)/);
  const version = m ? `${m[1]}.${m[2]}` : '';
  if (modelId.includes('opus'))   return version ? `Opus ${version}`   : 'Opus';
  if (modelId.includes('sonnet')) return version ? `Sonnet ${version}` : 'Sonnet';
  if (modelId.includes('haiku'))  return version ? `Haiku ${version}`  : 'Haiku';
  return modelId;
}
