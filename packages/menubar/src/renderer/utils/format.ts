export function elapsedStr(ms: number): string {
  const mins = Math.floor(ms / 60000);
  const hrs = Math.floor(mins / 60);
  return hrs > 0 ? `${hrs}h${mins % 60}m` : `${mins}m`;
}

export function agoStr(ts: number): string {
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  return `${hrs}h${mins % 60}m ago`;
}

export function compactPath(workingDir: string, home: string): string {
  if (!workingDir.startsWith(home)) return workingDir;
  const rel = '~' + workingDir.slice(home.length);
  const parts = rel.split('/').filter(Boolean);
  parts[0] = '~';
  if (parts.length <= 2) return rel;
  return [parts[0], ...parts.slice(1, -1).map(p => p.charAt(0)), parts[parts.length - 1]].join('/');
}

export function compressBranch(label: string, maxLen = 20): string {
  if (label.length <= maxLen) return label;
  const parts = label.split('/');
  if (parts.length <= 1) return label;
  const last = parts[parts.length - 1];
  const compressed = [...parts.slice(0, -1).map(p => p.charAt(0)), last].join('/');
  return compressed;
}

export function ctxBarClass(pct: number): string {
  const base = 'h-full rounded-[2px] transition-[width] duration-300';
  if (pct >= 80) return `${base} bg-ctx-crit`;
  if (pct >= 60) return `${base} bg-ctx-warn`;
  return `${base} bg-ctx-fill`;
}
