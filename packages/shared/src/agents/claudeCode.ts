import { existsSync } from 'fs';
import type { DashboardConfig } from '../types';
import { modelContextWindowFromConfig } from '../types';
import type { AgentDescriptor, TranscriptStats } from './types';
import { truncate, modelDisplayName } from './parseUtils';
import { calcTurnCost } from './cost';
import { isDashboardHook } from './installUtils';

const HOOK_EVENTS: Array<[string, string]> = [
  ['UserPromptSubmit', 'user-prompt'],
  ['PreToolUse', 'pre-tool'],
  ['PostToolUse', 'post-tool'],
  ['Stop', 'stop'],
  ['Notification', 'notification'],
];

// Extracted (behavior-frozen) from packages/hook/src/hook.ts readLastAssistantStats' Claude
// branch. Keep in lockstep with that function's Claude-only quirks — see the parity tests in
// packages/hook/src/__tests__/goldenParse.test.ts, which assert byte-for-byte equality against
// the legacy parser for the claude-code fixture.
function parse(lines: string[], endTurnOnly: boolean, cfg?: DashboardConfig): TranscriptStats {
  let text: string | null = null;
  let model: string | null = null;
  let rawModelId: string | null = null;
  let contextPct: number | null = null;
  let contextTokens: number | null = null;
  let turns = 0;
  let costUsd = 0;
  let cumulativeTokens = 0;
  let foundAssistant = false;
  let pastTurnBoundary = false;
  let schema: 'claude-code' | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      const isClaudeAssistant = entry.type === 'assistant' && entry.message?.model !== '<synthetic>';
      if (isClaudeAssistant) {
        const msg = entry.message;
        if (!foundAssistant) {
          foundAssistant = true;
          schema = 'claude-code';
          const modelId: string | null = typeof msg?.model === 'string' ? msg.model : null;
          const u = msg?.usage ?? {};
          const cacheRead   = typeof u.cache_read_input_tokens     === 'number' ? u.cache_read_input_tokens     : 0;
          const cacheCreate = typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0;
          // cache_read = tokens served from an existing cache breakpoint (not re-processed)
          // cache_creation = tokens written to a new cache checkpoint (freshly processed)
          // These represent different parts of the context, so sum all three fields.
          const lastTurnTokens =
            (typeof u.input_tokens === 'number' ? u.input_tokens : 0) +
            cacheRead + cacheCreate;
          contextTokens = lastTurnTokens > 0 ? lastTurnTokens : null;
          contextPct = modelId && lastTurnTokens > 0
            ? Math.min(100, Math.round((lastTurnTokens / modelContextWindowFromConfig(modelId, cfg)) * 100))
            : null;
          rawModelId = modelId;
          model = modelId ? modelDisplayName(modelId) : null;
        }
        // Scan backwards within the current turn for the most recent text block. Claude Code
        // emits text and tool_use as separate assistant entries, so the last entry before a
        // tool call is tool-only — we must keep looking back. When endTurnOnly=true (Stop
        // hook), only accept the final entry (stop_reason='end_turn') so we never grab an
        // intermediate tool-use text as the session's final message.
        const isEndTurn = msg?.stop_reason === 'end_turn';
        if (text === null && !pastTurnBoundary && (!endTurnOnly || isEndTurn)) {
          const blocks = msg?.content;
          if (Array.isArray(blocks)) {
            for (const block of blocks) {
              if (block?.type === 'text' && typeof block.text === 'string') {
                // NOTE: deliberately not using parseUtils' normalizeText here — legacy sets
                // text to the trimmed string even when it's empty (never null), whereas
                // normalizeText returns null for empty strings. Preserving the exact legacy
                // quirk (via truncate, not normalizeText) is required for byte-for-byte parity.
                const t = block.text.trim().replace(/\s+/g, ' ');
                text = truncate(t, 240);
                break;
              }
            }
          }
        }
      }
      // Count turns: only actual user text messages, not tool_result entries
      // (tool results are also stored as type:'user' in the transcript)
      if (entry.type === 'user') {
        const content = entry.message?.content;
        const isUserText = Array.isArray(content)
          ? content.some((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
          : typeof content === 'string' && content.length > 0;
        if (isUserText) {
          turns++;
          pastTurnBoundary = true; // don't read text from a previous turn
        }
      }
      if (entry.type === 'assistant' && entry.message?.usage && entry.message?.model && entry.message.model !== '<synthetic>') {
        costUsd += calcTurnCost(entry.message.usage as Record<string, unknown>, entry.message.model as string, cfg);
        const u = entry.message.usage as Record<string, unknown>;
        cumulativeTokens +=
          (typeof u.input_tokens  === 'number' ? u.input_tokens  : 0) +
          (typeof u.output_tokens === 'number' ? u.output_tokens : 0);
      }
    } catch { /* malformed line, skip */ }
  }

  return {
    text,
    model,
    modelId: rawModelId,
    contextPct,
    contextTokens,
    turns: turns > 0 ? turns : null,
    costUsd: costUsd > 0 ? Math.round(costUsd * 10000) / 10000 : null,
    totalTokens: cumulativeTokens > 0 ? cumulativeTokens : null,
    schema,
  };
}

function toolSummary(toolName: string, input: Record<string, unknown>): string | null {
  const trunc = (s: string, n = 60) => truncate(s, n);
  switch (toolName) {
    case 'Bash':       return input.command   ? trunc(String(input.command).replace(/\s+/g, ' ')) : null;
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

export const claudeCodeDescriptor: AgentDescriptor = {
  id: 'claude-code',
  displayName: 'Claude Code',
  color: '#D97757',
  iconKey: 'claude',
  processPattern: /claude/i,

  matchesTranscript: (l) => typeof (l as any)?.type === 'string'
    && ((l as any).type === 'assistant' || (l as any).type === 'user'),
  parse,
  toolSummary,
  payload: { sessionId: ['session_id'], cwd: ['cwd'] },
  sessionIdFromPayload: (p, fb) => (typeof p.session_id === 'string' && p.session_id) || fb,
  cwdFromPayload: (p, fb) => (typeof p.cwd === 'string' && p.cwd) || fb,

  isInstalled: (home) => existsSync(`${home}/.claude`),
  configPath: (home) => `${home}/.claude/settings.json`,
  defaultConfig: () => ({}),
  installHooks: (config, hookCmd) => {
    const c = config as { hooks?: Record<string, unknown[]> };
    c.hooks = c.hooks ?? {};
    for (const [event, arg] of HOOK_EVENTS) {
      const entry = {
        matcher: '',
        hooks: [{ type: 'command', command: hookCmd(arg) }],
      };
      const existing: unknown[] = c.hooks[event] ?? [];
      c.hooks[event] = [...existing.filter((h) => !isDashboardHook(h)), entry];
    }
  },
};
