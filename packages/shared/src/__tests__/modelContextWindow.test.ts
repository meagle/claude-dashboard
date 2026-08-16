import {
  modelContextWindowFromConfig,
  DEFAULT_CONTEXT_WINDOW,
  DashboardConfig,
} from '../types';

// Minimal cfg carrying only the field the function reads.
function cfg(mcw: {
  fetched?: Record<string, number>;
  custom?: Array<{ prefix: string; contextWindow: number }>;
}): DashboardConfig {
  return { modelContextWindows: { fetched: mcw.fetched ?? {}, custom: mcw.custom ?? [] } } as unknown as DashboardConfig;
}

describe('modelContextWindowFromConfig', () => {
  // Regression: litellm collapses every claude-opus-4-* into one coarse
  // "claude-opus-4" bucket at 200k. A 1M Opus 4.8 session was showing 100%
  // (594k/200k capped) instead of ~59% (594k/1M). The specific KNOWN entry
  // must beat the coarse fetched prefix.
  it('a specific KNOWN entry beats a coarse fetched family prefix (opus-4-8)', () => {
    const c = cfg({ fetched: { 'claude-opus-4': 200_000, 'claude-opus-5': 1_000_000 } });
    expect(modelContextWindowFromConfig('claude-opus-4-8', c)).toBe(1_000_000);
  });

  it('also fixes opus-4-6 / opus-4-7 against the coarse fetched prefix', () => {
    const c = cfg({ fetched: { 'claude-opus-4': 200_000 } });
    expect(modelContextWindowFromConfig('claude-opus-4-7', c)).toBe(1_000_000);
    expect(modelContextWindowFromConfig('claude-opus-4-6', c)).toBe(1_000_000);
  });

  it('uses the coarse fetched window for an old opus with no KNOWN entry', () => {
    const c = cfg({ fetched: { 'claude-opus-4': 200_000 } });
    // Opus 4.0/4.1 are genuinely 200k and have no KNOWN override.
    expect(modelContextWindowFromConfig('claude-opus-4-1', c)).toBe(200_000);
  });

  it('a user custom override wins over both fetched and KNOWN', () => {
    const c = cfg({
      fetched: { 'claude-opus-4': 200_000 },
      custom: [{ prefix: 'claude-opus-4-8', contextWindow: 500_000 }],
    });
    expect(modelContextWindowFromConfig('claude-opus-4-8', c)).toBe(500_000);
  });

  it('custom wins the tie when its prefix length equals a KNOWN entry', () => {
    const c = cfg({ custom: [{ prefix: 'claude-sonnet-5', contextWindow: 250_000 }] });
    expect(modelContextWindowFromConfig('claude-sonnet-5', c)).toBe(250_000);
  });

  it('falls back to KNOWN when nothing is fetched/custom', () => {
    expect(modelContextWindowFromConfig('claude-sonnet-5')).toBe(1_000_000);
  });

  it('returns the default for an unknown model with no config', () => {
    expect(modelContextWindowFromConfig('some-unknown-model')).toBe(DEFAULT_CONTEXT_WINDOW);
  });
});
