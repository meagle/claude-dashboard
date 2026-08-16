import * as path from 'path';
import * as fs from 'fs';
import {
  DEFAULT_CONFIG,
  DashboardConfig,
  AgentDescriptor,
  claudeCodeDescriptor,
  cursorDescriptor,
  codexDescriptor,
  safeParseLines,
} from '@claude-dashboard/shared';

const fixture = (name: string) =>
  path.join(__dirname, 'fixtures', `${name}.transcript.jsonl`);

const linesOf = (name: string) =>
  safeParseLines(fs.readFileSync(fixture(name), 'utf8'));

// The hook no longer parses transcripts itself — it dispatches to a per-agent descriptor
// resolved from the `--agent` flag. These snapshots lock in each descriptor's parse() output
// for a real captured transcript of that agent. Task 3–4 proved descriptor.parse reproduced
// the (now-deleted) inline parser byte-for-byte, so repointing here left the snapshot values
// unchanged.
const descriptorFor: Record<string, AgentDescriptor> = {
  'claude-code': claudeCodeDescriptor,
  cursor: cursorDescriptor,
  codex: codexDescriptor,
};

describe('golden transcript parse output', () => {
  for (const agent of ['claude-code', 'cursor', 'codex']) {
    const descriptor = descriptorFor[agent];
    it(`${agent}: mid-turn stats are stable`, () => {
      expect(descriptor.parse(linesOf(agent), false)).toMatchSnapshot();
    });
    it(`${agent}: end-turn stats are stable`, () => {
      expect(descriptor.parse(linesOf(agent), true)).toMatchSnapshot();
    });
  }
});

// The unpriced fixtures above leave costUsd null (neither "claude-opus-5" nor
// "gpt-5.6-luna" — the fixtures' real model ids — match any hardcoded prefix in the
// pricing table), so those snapshots don't exercise the cost math at all. That's the
// riskiest path to leave unpinned: Codex's cost calculation subtracts cached_input_tokens
// out of input_tokens before pricing it (input_tokens is cache-inclusive there, unlike
// Claude's usage shape) — a later change could easily invert or drop that subtraction
// without any test catching it. These two cases supply a custom pricing cfg so the snapshot
// actually locks in a non-null, cache-aware cost value.
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
    expect(claudeCodeDescriptor.parse(linesOf('claude-code'), true, pricingCfg)).toMatchSnapshot();
  });

  it('codex: end-turn stats WITH pricing cfg are stable', () => {
    expect(codexDescriptor.parse(linesOf('codex'), true, pricingCfg)).toMatchSnapshot();
  });
});
