import { existsSync } from 'fs';
import type { DashboardConfig } from '../types';
import type { AgentDescriptor, TranscriptStats } from './types';
import { truncate } from './parseUtils';
import { calcTurnCost } from './cost';

// Extracted (behavior-frozen) from packages/hook/src/hook.ts readCodexStats +
// isCodexRolloutEntry + CODEX_ROLLOUT_TYPES. Keep in lockstep with that function's Codex-only
// quirks — see the parity tests in packages/hook/src/__tests__/goldenParse.test.ts, which
// assert byte-for-byte equality against the legacy parser for the codex fixture.

// Codex CLI's rollout transcript format (confirmed live, Codex CLI 0.147.0): newline-
// delimited {timestamp, type, payload} lines. `type` is one of a fixed set of rollout
// item kinds — structurally distinct from Claude Code's/Cursor's flat {type|role, message}
// entries, so a single successfully-parsed line is enough to tell schemas apart.
const CODEX_ROLLOUT_TYPES = new Set([
  'session_meta', 'event_msg', 'response_item', 'turn_context', 'world_state', 'compacted',
]);

function isCodexRolloutEntry(entry: unknown): boolean {
  if (typeof entry !== 'object' || entry === null) return false;
  const e = entry as Record<string, unknown>;
  return typeof e.type === 'string' && CODEX_ROLLOUT_TYPES.has(e.type)
    && typeof e.payload === 'object' && e.payload !== null;
}

// Codex reports its own token accounting per rollout line — no static context-window
// table needed the way Claude/Cursor sessions require one.
interface CodexTokenUsage {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteInputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function parse(lines: string[], endTurnOnly: boolean, cfg?: DashboardConfig): TranscriptStats {
  let text: string | null = null;
  let modelId: string | null = null;
  let turns = 0;
  let tokenUsage: CodexTokenUsage | null = null;
  let modelContextWindow: number | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    const type = entry.type;
    const payload = entry.payload as Record<string, unknown> | undefined;
    if (!payload) continue;

    if (type === 'turn_context' && modelId === null && typeof payload.model === 'string') {
      modelId = payload.model;
    } else if (type === 'event_msg' && payload.type === 'token_count' && tokenUsage === null) {
      const info = (payload.info as Record<string, unknown>) ?? {};
      const u = (info.total_token_usage as Record<string, unknown>) ?? {};
      tokenUsage = {
        inputTokens: typeof u.input_tokens === 'number' ? u.input_tokens : 0,
        cachedInputTokens: typeof u.cached_input_tokens === 'number' ? u.cached_input_tokens : 0,
        cacheWriteInputTokens: typeof u.cache_write_input_tokens === 'number' ? u.cache_write_input_tokens : 0,
        outputTokens: typeof u.output_tokens === 'number' ? u.output_tokens : 0,
        totalTokens: typeof u.total_tokens === 'number' ? u.total_tokens : 0,
      };
      modelContextWindow = typeof info.model_context_window === 'number' ? info.model_context_window : null;
    } else if (type === 'event_msg' && payload.type === 'agent_message' && text === null) {
      if (!endTurnOnly || payload.phase === 'final_answer') {
        const raw = String(payload.message ?? '').trim().replace(/\s+/g, ' ');
        text = raw.length > 240 ? raw.slice(0, 240) + '…' : (raw.length > 0 ? raw : null);
      }
    } else if (type === 'event_msg' && payload.type === 'user_message') {
      turns++;
    } else if (type === 'event_msg' && payload.type === 'item_completed') {
      // Codex's INTERACTIVE (`codex-tui`) mode wraps messages differently than the flat
      // `agent_message`/`user_message` shape above, which only `codex exec` mode was
      // confirmed to produce — confirmed live against a real interactive session (Codex
      // CLI 0.147.0): event_msg's payload.type is "item_completed", wrapping an `item`
      // object with `item.type: "UserMessage"|"AgentMessage"` (PascalCase). Reads `.text`
      // directly rather than checking the content block's inner `type`, since UserMessage
      // and AgentMessage disagree on its casing ("text" vs "Text") in real captured data.
      const item = payload.item as Record<string, unknown> | undefined;
      const itemType = item?.type;
      if (itemType === 'UserMessage') {
        turns++;
      } else if (itemType === 'AgentMessage' && text === null) {
        if (!endTurnOnly || item?.phase === 'final_answer') {
          const content = item?.content as Array<Record<string, unknown>> | undefined;
          const raw = String(content?.[0]?.text ?? '').trim().replace(/\s+/g, ' ');
          text = raw.length > 240 ? raw.slice(0, 240) + '…' : (raw.length > 0 ? raw : null);
        }
      }
    }
  }

  let contextTokens: number | null = null;
  let contextPct: number | null = null;
  let totalTokens: number | null = null;
  if (tokenUsage && modelContextWindow) {
    contextTokens = tokenUsage.totalTokens > 0 ? tokenUsage.totalTokens : null;
    contextPct = contextTokens !== null
      ? Math.min(100, Math.round((contextTokens / modelContextWindow) * 100))
      : null;
    totalTokens = contextTokens;
  }

  const costUsd = tokenUsage && modelId
    ? calcTurnCost(
        {
          // Codex's `input_tokens` is cache-inclusive (confirmed live: input_tokens +
          // output_tokens == total_tokens exactly, with cached_input_tokens as a subset
          // of input_tokens, not additional to it) — unlike calcTurnCost's Claude-derived
          // usage shape, where input_tokens and cache_read_input_tokens are mutually
          // exclusive pools. Subtract the cached portion so it's only priced once, at the
          // cache-read rate, instead of once at full input rate and again at cache-read rate.
          input_tokens: Math.max(0, tokenUsage.inputTokens - tokenUsage.cachedInputTokens),
          output_tokens: tokenUsage.outputTokens,
          cache_read_input_tokens: tokenUsage.cachedInputTokens,
          cache_creation_input_tokens: tokenUsage.cacheWriteInputTokens,
        },
        modelId,
        cfg,
      )
    : 0;

  return {
    text,
    model: modelId,
    modelId,
    contextPct,
    contextTokens,
    turns: turns > 0 ? turns : null,
    costUsd: costUsd > 0 ? Math.round(costUsd * 10000) / 10000 : null,
    totalTokens,
    schema: 'codex',
  };
}

function toolSummary(toolName: string, input: Record<string, unknown>): string | null {
  const trunc = (s: string, n = 60) => truncate(s, n);
  switch (toolName) {
    case 'Bash':       return input.command   ? trunc(String(input.command).replace(/\s+/g, ' ')) : null;
    // Codex CLI's file-edit tool (confirmed via a real captured preToolUse payload):
    // tool_input.command is a patch-format string, e.g.
    // "*** Begin Patch\n*** Update File: /path/to/sample.txt\n@@\n+round 2\n*** End Patch"
    case 'apply_patch': {
      const cmd = String(input.command ?? '');
      const m = cmd.match(/\*\*\* (?:Update|Add|Delete) File: (.+)/);
      return m ? trunc(m[1]) : null;
    }
    case 'Read':       return input.file_path ? trunc(String(input.file_path)) : null;
    case 'Write':      return input.file_path ? trunc(String(input.file_path)) : null;
    case 'Edit':       return input.file_path ? trunc(String(input.file_path)) : null;
    case 'Glob':       return input.pattern   ? trunc(String(input.pattern)) : null;
    case 'Grep':       return input.pattern   ? trunc(String(input.pattern)) : null;
    case 'WebFetch':   return input.url       ? trunc(String(input.url)) : null;
    case 'WebSearch':  return input.query     ? trunc(String(input.query)) : null;
    case 'Agent':      return input.subagent_type ? trunc(String(input.subagent_type)) : null;
    default:           return null;
  }
}

export const codexDescriptor: AgentDescriptor = {
  id: 'codex',
  displayName: 'Codex',
  color: '#10a37f',
  iconKey: 'codex',
  processPattern: /codex/i,

  matchesTranscript: isCodexRolloutEntry,
  parse,
  toolSummary,
  payload: { sessionId: ['session_id'], cwd: ['cwd'] },
  sessionIdFromPayload: (p, fb) => (typeof p.session_id === 'string' && p.session_id) || fb,
  cwdFromPayload: (p, fb) => (typeof p.cwd === 'string' && p.cwd) || fb,

  isInstalled: (home) => existsSync(`${home}/.codex`),
  configPath: (home) => `${home}/.codex/hooks.json`,
  defaultConfig: () => ({ hooks: {} }),
  installHooks: () => { throw new Error('installHooks wired in Task 6'); },
};
