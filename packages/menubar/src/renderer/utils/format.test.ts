import { describe, it, expect, vi, beforeEach } from 'vitest';
import { elapsedStr, agoStr, compactPath, ctxBarClass } from './format';

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
