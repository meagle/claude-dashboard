import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { truncate, normalizeText, computeContextPct } from '../agents/parseUtils';
import { calcTurnCost } from '../agents/cost';
import {
  HOOK_AGENTS,
  SOURCES,
  SOURCE_META,
  SOURCE_BY_ID,
  sourceDisplayName,
  isSourceId,
  getAgentById,
  probeAgent,
  isKnownAgentProcessArgs,
  claudeCodeDescriptor,
  cursorDescriptor,
  codexDescriptor,
} from '../agents';

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

describe('agent registry', () => {
  it('every hook agent has a unique id', () => {
    const ids = HOOK_AGENTS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('manifest includes desktop presence', () => {
    expect(SOURCES.find((s) => s.id === 'desktop')?.kind).toBe('presence');
  });

  it('manifest includes every hook agent, tagged with kind "hook"', () => {
    for (const agent of HOOK_AGENTS) {
      expect(SOURCES.find((s) => s.id === agent.id)).toMatchObject({
        kind: 'hook',
        displayName: agent.displayName,
        color: agent.color,
        iconKey: agent.iconKey,
      });
    }
  });

  it('process pattern matches known agents', () => {
    expect(isKnownAgentProcessArgs('/usr/bin/node .../cursor-agent')).toBe(true);
    expect(isKnownAgentProcessArgs('/usr/local/bin/node /usr/local/bin/claude')).toBe(true);
    expect(isKnownAgentProcessArgs('/usr/local/bin/node /usr/local/bin/codex')).toBe(true);
    expect(isKnownAgentProcessArgs('/bin/zsh -l')).toBe(false);
  });

  it('getAgentById round-trips', () => {
    expect(getAgentById('codex')?.displayName).toBe('Codex');
    expect(getAgentById('claude-code')?.displayName).toBe('Claude Code');
    expect(getAgentById('cursor')?.displayName).toBe('Cursor');
    expect(getAgentById('nonexistent-agent')).toBeUndefined();
  });

  it('probeAgent returns the first descriptor whose matchesTranscript is true', () => {
    expect(probeAgent({ type: 'assistant' })?.id).toBe('claude-code');
    expect(probeAgent({ role: 'assistant' })?.id).toBe('cursor');
    expect(probeAgent({ type: 'session_meta', payload: {} })?.id).toBe('codex');
    expect(probeAgent({ nonsense: true })).toBeUndefined();
  });
});

describe('source metadata', () => {
  // AgentDescriptor.id is typed as SourceId, so an id outside Session['source'] is already a
  // compile error. This pins the same invariant at runtime, since a bad id would otherwise
  // reach sessions.json as a `source` no consumer can render.
  it('every hook agent id is a known source', () => {
    for (const agent of HOOK_AGENTS) {
      expect(isSourceId(agent.id)).toBe(true);
      expect(SOURCE_META[agent.id]).toBeDefined();
    }
  });

  it('SOURCE_META covers every source in the manifest', () => {
    for (const source of SOURCES) {
      expect(SOURCE_META[source.id]).toBeDefined();
    }
  });

  it('every SOURCE_META entry is reachable through the manifest', () => {
    const manifestIds = new Set(SOURCES.map((s) => s.id));
    for (const id of Object.keys(SOURCE_META)) {
      expect(manifestIds.has(id as (typeof SOURCES)[number]['id'])).toBe(true);
    }
  });

  it('SOURCE_BY_ID is populated for every source', () => {
    for (const source of SOURCES) {
      expect(SOURCE_BY_ID[source.id]).toEqual(source);
    }
    expect(Object.keys(SOURCE_BY_ID)).toHaveLength(SOURCES.length);
  });

  it('descriptors take their display identity from SOURCE_META', () => {
    for (const agent of HOOK_AGENTS) {
      const meta = SOURCE_META[agent.id];
      expect({
        displayName: agent.displayName,
        color: agent.color,
        iconKey: agent.iconKey,
      }).toEqual(meta);
    }
  });

  it('sourceDisplayName resolves known sources and falls back agent-agnostically', () => {
    expect(sourceDisplayName('claude-code')).toBe('Claude Code');
    expect(sourceDisplayName('cursor')).toBe('Cursor');
    expect(sourceDisplayName('codex')).toBe('Codex');
    expect(sourceDisplayName('desktop')).toBe('Claude Desktop');
    expect(sourceDisplayName('some-future-agent')).toBe('Agent');
    expect(sourceDisplayName(undefined)).toBe('Agent');
  });
});

describe('installHooks', () => {
  it('claude install writes a nested command entry with the --agent flag', () => {
    const cfg: Record<string, unknown> = {};
    claudeCodeDescriptor.installHooks(cfg, (a) => `hook ${a} --agent=claude-code`);
    const hooks = cfg.hooks as Record<string, any[]>;
    expect(hooks.PreToolUse[0].hooks[0].command).toContain('--agent=claude-code');
    expect(hooks.PreToolUse[0]).toHaveProperty('matcher');
  });

  it('cursor install uses flat command entries + native event names', () => {
    const cfg: Record<string, unknown> = { version: 1, hooks: {} };
    cursorDescriptor.installHooks(cfg, (a) => `hook ${a} --agent=cursor`);
    const hooks = cfg.hooks as Record<string, any[]>;
    // Flat shape: command lives directly on the entry, not nested under .hooks
    expect(hooks.beforeSubmitPrompt[0].command).toContain('--agent=cursor');
    expect(hooks.beforeSubmitPrompt[0].hooks).toBeUndefined();
  });

  it('codex install includes a PermissionRequest event', () => {
    const cfg: Record<string, unknown> = { hooks: {} };
    codexDescriptor.installHooks(cfg, (a) => `hook ${a} --agent=codex`);
    const hooks = cfg.hooks as Record<string, any[]>;
    expect(hooks.PermissionRequest[0].hooks[0].command).toContain('permission-request');
  });

  it('re-running install is idempotent (no duplicate dashboard entries)', () => {
    const cfg: Record<string, unknown> = {};
    const cmd = (a: string) => `node ~/.config/claude-dashboard/hook.js ${a} --agent=claude-code`;
    claudeCodeDescriptor.installHooks(cfg, cmd);
    claudeCodeDescriptor.installHooks(cfg, cmd);
    const hooks = cfg.hooks as Record<string, any[]>;
    expect(hooks.PreToolUse).toHaveLength(1);
  });
});

describe('isInstalled', () => {
  it('detects presence of an agent home dir and ignores absent ones', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agents-'));
    try {
      fs.mkdirSync(path.join(tmp, '.codex'));
      expect(codexDescriptor.isInstalled(tmp)).toBe(true);
      expect(cursorDescriptor.isInstalled(tmp)).toBe(false);
      expect(claudeCodeDescriptor.isInstalled(tmp)).toBe(false);
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true });
    }
  });
});
