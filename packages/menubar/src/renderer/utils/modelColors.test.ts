import { describe, it, expect } from 'vitest';
import { modelColorFromConfig, modelBadgeStyle } from './modelColors';

const COLORS = {
  'claude-sonnet':     { color: '#D97757', badgeStyle: 'A' as const },
  'claude-opus':       { color: '#9a5dc0', badgeStyle: 'B' as const },
  'claude-sonnet-4-6': { color: '#ff0000', badgeStyle: 'C' as const },
};

describe('modelColorFromConfig', () => {
  it('returns null for null model', () => {
    expect(modelColorFromConfig(null, COLORS)).toBeNull();
  });

  it('returns null when no prefix matches', () => {
    expect(modelColorFromConfig('gpt-4', COLORS)).toBeNull();
  });

  it('matches by prefix', () => {
    const result = modelColorFromConfig('claude-opus-4-7', COLORS);
    expect(result).toEqual({ color: '#9a5dc0', badgeStyle: 'B' });
  });

  it('longest prefix wins over shorter', () => {
    // 'claude-sonnet-4-6' is longer than 'claude-sonnet', should win
    const result = modelColorFromConfig('claude-sonnet-4-6-20251022', COLORS);
    expect(result).toEqual({ color: '#ff0000', badgeStyle: 'C' });
  });

  it('shorter prefix matches when longer does not apply', () => {
    const result = modelColorFromConfig('claude-sonnet-4-5', COLORS);
    expect(result).toEqual({ color: '#D97757', badgeStyle: 'A' });
  });

  it('returns null when modelColors is empty', () => {
    expect(modelColorFromConfig('claude-sonnet-4-6', {})).toBeNull();
  });
});

describe('modelBadgeStyle', () => {
  it('returns teal fallback for null entry', () => {
    const style = modelBadgeStyle(null);
    expect(style.color).toBe('#5acce0');
    expect(style.background).toBe('#0a3a42');
  });

  it('style A: tinted background, text color', () => {
    const style = modelBadgeStyle({ color: '#D97757', badgeStyle: 'A' });
    expect(style.color).toBe('#D97757');
    expect(typeof style.background).toBe('string');
    expect((style.background as string)).toContain('rgba');
    expect(style.border).toBeUndefined();
  });

  it('style B: solid background, white text', () => {
    const style = modelBadgeStyle({ color: '#9a5dc0', badgeStyle: 'B' });
    expect(style.background).toBe('#9a5dc0');
    expect(style.color).toBe('#fff');
  });

  it('style C: translucent bg, colored text, colored border', () => {
    const style = modelBadgeStyle({ color: '#4ade70', badgeStyle: 'C' });
    expect(style.color).toBe('#4ade70');
    expect(typeof style.border).toBe('string');
    expect((style.border as string)).toContain('rgba');
  });
});
