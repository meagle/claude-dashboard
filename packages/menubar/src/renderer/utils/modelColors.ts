import type { CSSProperties } from 'react';

type ModelColorEntry = { color: string; badgeStyle: 'A' | 'B' | 'C' };

function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function modelColorFromConfig(
  model: string | null,
  modelColors: Record<string, ModelColorEntry>,
): ModelColorEntry | null {
  if (!model) return null;
  const sorted = Object.keys(modelColors).sort((a, b) => b.length - a.length);
  const match = sorted.find((prefix) => model.startsWith(prefix));
  return match ? modelColors[match] : null;
}

export function modelBadgeStyle(entry: ModelColorEntry | null): CSSProperties {
  if (!entry) return { background: '#0a3a42', color: '#5acce0' };
  const { color, badgeStyle } = entry;
  if (badgeStyle === 'B') return { background: color, color: '#fff' };
  if (badgeStyle === 'C') {
    return {
      background: hexToRgba(color, 0.12),
      color,
      border: `1px solid ${hexToRgba(color, 0.30)}`,
    };
  }
  return { background: hexToRgba(color, 0.18), color };
}
