import { truncate, normalizeText, computeContextPct } from '../agents/parseUtils';
import { calcTurnCost } from '../agents/cost';

describe('parseUtils', () => {
  it('truncate adds ellipsis past limit', () => {
    expect(truncate('abcdef', 3)).toBe('abc…');
    expect(truncate('ab', 3)).toBe('ab');
  });
  it('computeContextPct caps at 100 and floors at null', () => {
    expect(computeContextPct(0, 200000)).toBeNull();
    expect(computeContextPct(300000, 200000)).toBe(100);
    expect(computeContextPct(100000, 200000)).toBe(50);
  });
  it('normalizeText collapses whitespace', () => {
    expect(normalizeText('  a\n  b  ')).toBe('a b');
    expect(normalizeText('   ')).toBeNull();
  });
});

describe('cost', () => {
  it('prices a claude-opus turn from the built-in table', () => {
    const usd = calcTurnCost({ input_tokens: 1_000_000, output_tokens: 0 }, 'claude-opus-4-8');
    expect(usd).toBeCloseTo(15, 5);
  });
});
