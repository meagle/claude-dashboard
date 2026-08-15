import * as path from 'path';
import * as fs from 'fs';
import {
  DEFAULT_CONFIG,
  DashboardConfig,
  claudeCodeDescriptor,
  cursorDescriptor,
  safeParseLines,
} from '@claude-dashboard/shared';
import { readLastAssistantStats } from '../hook';

const fixture = (name: string) =>
  path.join(__dirname, 'fixtures', `${name}.transcript.jsonl`);

const linesOf = (name: string) =>
  safeParseLines(fs.readFileSync(fixture(name), 'utf8'));

describe('golden transcript parse output', () => {
  for (const agent of ['claude-code', 'cursor', 'codex']) {
    it(`${agent}: mid-turn stats are stable`, () => {
      expect(readLastAssistantStats(fixture(agent), false)).toMatchSnapshot();
    });
    it(`${agent}: end-turn stats are stable`, () => {
      expect(readLastAssistantStats(fixture(agent), true)).toMatchSnapshot();
    });
  }
});

// The unpriced fixtures above leave costUsd null (neither "claude-opus-5" nor
// "gpt-5.6-luna" — the fixtures' real model ids — match any hardcoded prefix in
// hook.ts's MODEL_PRICING table), so those snapshots don't exercise the cost
// math at all. That's the riskiest path to leave unpinned: Codex's cost
// calculation subtracts cached_input_tokens out of input_tokens before pricing
// it (input_tokens is cache-inclusive there, unlike Claude's usage shape) — a
// later per-agent extraction could easily invert or drop that subtraction
// without any test catching it. These two cases supply a custom pricing cfg
// so the snapshot actually locks in a non-null, cache-aware cost value.
describe('golden transcript parse output with pricing cfg', () => {
  const pricingCfg: DashboardConfig = {
    ...DEFAULT_CONFIG,
    modelPricing: {
      fetched: {},
      custom: [
        // Matches the claude-code fixture's real message.model verbatim.
        { prefix: 'claude-opus-5', input: 15, cacheWrite: 18.75, cacheRead: 1.5, output: 75 },
        // Matches the codex fixture's real payload.model verbatim.
        { prefix: 'gpt-5.6-luna', input: 1.25, cacheWrite: 1.25, cacheRead: 0.125, output: 10 },
      ],
    },
  };

  it('claude-code: end-turn stats WITH pricing cfg are stable', () => {
    expect(readLastAssistantStats(fixture('claude-code'), true, pricingCfg)).toMatchSnapshot();
  });

  it('codex: end-turn stats WITH pricing cfg are stable', () => {
    expect(readLastAssistantStats(fixture('codex'), true, pricingCfg)).toMatchSnapshot();
  });
});

// Task 3: claude-code and cursor descriptors' parse() must reproduce
// readLastAssistantStats' output byte-for-byte for their respective schemas. If any field
// differs here, the extraction in packages/shared/src/agents/{claudeCode,cursor}.ts is wrong
// — fix the descriptor, never this assertion (the one deliberate difference — descriptor
// `schema` vs. legacy `schema` — already match, since both are the descriptor id).
describe('descriptor parse() matches legacy parser (parity)', () => {
  it('claude-code descriptor matches legacy parser (mid-turn)', () => {
    expect(claudeCodeDescriptor.parse(linesOf('claude-code'), false))
      .toEqual(readLastAssistantStats(fixture('claude-code'), false));
  });
  it('claude-code descriptor matches legacy parser (end-turn)', () => {
    expect(claudeCodeDescriptor.parse(linesOf('claude-code'), true))
      .toEqual(readLastAssistantStats(fixture('claude-code'), true));
  });
  it('claude-code descriptor matches legacy parser (end-turn, with pricing cfg)', () => {
    const pricingCfg: DashboardConfig = {
      ...DEFAULT_CONFIG,
      modelPricing: {
        fetched: {},
        custom: [
          { prefix: 'claude-opus-5', input: 15, cacheWrite: 18.75, cacheRead: 1.5, output: 75 },
        ],
      },
    };
    expect(claudeCodeDescriptor.parse(linesOf('claude-code'), true, pricingCfg))
      .toEqual(readLastAssistantStats(fixture('claude-code'), true, pricingCfg));
  });

  it('cursor descriptor matches legacy parser (mid-turn)', () => {
    expect(cursorDescriptor.parse(linesOf('cursor'), false))
      .toEqual(readLastAssistantStats(fixture('cursor'), false));
  });
  it('cursor descriptor matches legacy parser (end-turn)', () => {
    expect(cursorDescriptor.parse(linesOf('cursor'), true))
      .toEqual(readLastAssistantStats(fixture('cursor'), true));
  });
  it('cursor descriptor matches legacy parser (end-turn, with pricing cfg)', () => {
    // Cursor transcripts carry no model/usage data, so a pricing cfg is a no-op for this
    // schema — asserted here anyway to lock that in.
    const pricingCfg: DashboardConfig = {
      ...DEFAULT_CONFIG,
      modelPricing: {
        fetched: {},
        custom: [
          { prefix: 'claude-opus-5', input: 15, cacheWrite: 18.75, cacheRead: 1.5, output: 75 },
        ],
      },
    };
    expect(cursorDescriptor.parse(linesOf('cursor'), true, pricingCfg))
      .toEqual(readLastAssistantStats(fixture('cursor'), true, pricingCfg));
  });
});
