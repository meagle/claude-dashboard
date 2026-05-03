import { describe, it, expect, vi, beforeEach } from 'vitest';
import { elapsedStr, agoStr, compactPath, compressBranch, ctxBarClass, formatTokensShort } from './format';

describe('elapsedStr', () => {
  it('shows 0m for less than a minute', () => {
    expect(elapsedStr(0)).toBe('0m');
    expect(elapsedStr(59_000)).toBe('0m');
  });

  it('shows minutes', () => {
    expect(elapsedStr(60_000)).toBe('1m');
    expect(elapsedStr(59 * 60_000)).toBe('59m');
  });

  it('shows hours and minutes', () => {
    expect(elapsedStr(60 * 60_000)).toBe('1h0m');
    expect(elapsedStr(90 * 60_000)).toBe('1h30m');
    expect(elapsedStr(125 * 60_000)).toBe('2h5m');
  });
});

describe('agoStr', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
  });

  it('returns "just now" for under a minute ago', () => {
    const ts = Date.now() - 30_000;
    expect(agoStr(ts)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const ts = Date.now() - 5 * 60_000;
    expect(agoStr(ts)).toBe('5m ago');
  });

  it('returns hours and minutes ago', () => {
    const ts = Date.now() - 90 * 60_000;
    expect(agoStr(ts)).toBe('1h30m ago');
  });
});

describe('compactPath', () => {
  const home = '/Users/alice';

  it('replaces home prefix with ~', () => {
    expect(compactPath('/Users/alice/code', home)).toBe('~/code');
  });

  it('compacts 3-part paths to initial for middle segment', () => {
    expect(compactPath('/Users/alice/code/myproject', home)).toBe('~/c/myproject');
  });

  it('compacts long paths to initials for middle segments', () => {
    expect(compactPath('/Users/alice/code/work/myproject', home)).toBe('~/c/w/myproject');
  });

  it('handles multiple middle segments already single-char', () => {
    expect(compactPath('/Users/alice/a/b/c/project', home)).toBe('~/a/b/c/project');
  });

  it('leaves non-home paths unchanged', () => {
    expect(compactPath('/var/log/app', home)).toBe('/var/log/app');
  });
});

describe('compressBranch', () => {
  it('leaves short labels unchanged', () => {
    expect(compressBranch('main')).toBe('main');
    expect(compressBranch('feature/short')).toBe('feature/short');
  });

  it('compresses prefix segments when label exceeds maxLen', () => {
    expect(compressBranch('feature/card-layout-polish')).toBe('f/card-layout-polish');
  });

  it('compresses multiple prefix segments', () => {
    expect(compressBranch('feat/some/long/branch-name')).toBe('f/s/l/branch-name');
  });

  it('respects custom maxLen', () => {
    expect(compressBranch('feat/short', 5)).toBe('f/short');
    expect(compressBranch('feat/short', 20)).toBe('feat/short');
  });

  it('does not compress single-segment labels', () => {
    expect(compressBranch('this-is-a-very-long-branch-name')).toBe('this-is-a-very-long-branch-name');
  });
});

describe('ctxBarClass', () => {
  it('returns normal class for low pct', () => {
    expect(ctxBarClass(0)).toContain('bg-ctx-fill');
    expect(ctxBarClass(59)).toContain('bg-ctx-fill');
  });

  it('returns warn class at 60%', () => {
    expect(ctxBarClass(60)).toContain('bg-ctx-warn');
    expect(ctxBarClass(79)).toContain('bg-ctx-warn');
  });

  it('returns crit class at 80%', () => {
    expect(ctxBarClass(80)).toContain('bg-ctx-crit');
    expect(ctxBarClass(100)).toContain('bg-ctx-crit');
  });
});

describe('formatTokensShort', () => {
  it('returns null for null input', () => {
    expect(formatTokensShort(null)).toBeNull();
  });

  it('returns the raw number as string for values under 1000', () => {
    expect(formatTokensShort(500)).toBe('500');
    expect(formatTokensShort(999)).toBe('999');
  });

  it('returns rounded k notation for 1000 and above', () => {
    expect(formatTokensShort(1000)).toBe('1k');
    expect(formatTokensShort(23000)).toBe('23k');
    expect(formatTokensShort(1500)).toBe('2k');
  });

  it('does not include "tok" suffix', () => {
    expect(formatTokensShort(5000)).not.toContain('tok');
  });
});
