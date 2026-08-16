import { existsSync } from 'fs';
import type { DashboardConfig } from '../types';
import type { AgentDescriptor, TranscriptStats } from './types';
import { truncate } from './parseUtils';
import { isDashboardHook } from './installUtils';

const HOOK_EVENTS: Array<[string, string]> = [
  ['beforeSubmitPrompt', 'user-prompt'],
  ['preToolUse', 'pre-tool'],
  ['postToolUse', 'post-tool'],
  ['stop', 'stop'],
];

// Extracted (behavior-frozen) from packages/hook/src/hook.ts readLastAssistantStats' Cursor
// branch. Keep in lockstep with that function's Cursor-only quirks — see the parity tests in
// packages/hook/src/__tests__/goldenParse.test.ts, which assert byte-for-byte equality against
// the legacy parser for the cursor fixture.
//
// Cursor's own agent (not the `claude` CLI) fires the same hook events but writes transcripts
// in a different schema: entries use `role` instead of `type` and carry no model/usage/
// stop_reason. A turn's end is *sometimes* marked by a standalone `{"type":"turn_ended"}` line,
// but confirmed live against a real interactive cursor-agent session: it is not written
// reliably per turn (a two-turn session had exactly one, trailing the second turn only, after
// an API error) — requiring it caused the Stop hook to miss the first turn's response entirely
// and show later cards one turn behind. So the most recent assistant entry (scanning
// backwards) is always treated as the turn's final message, regardless of endTurnOnly.
function parse(lines: string[], _endTurnOnly: boolean, _cfg?: DashboardConfig): TranscriptStats {
  let text: string | null = null;
  let turns = 0;
  let foundAssistant = false;
  let pastTurnBoundary = false;
  let schema: 'cursor' | null = null;

  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type === 'turn_ended') {
        // Harmless, occasionally-present signal — see file header. Has no effect on the
        // output (kept only for structural fidelity with the legacy scan).
        continue;
      }
      const isCursorAssistant = entry.type === undefined && entry.role === 'assistant';
      if (isCursorAssistant) {
        const msg = entry.message;
        if (!foundAssistant) {
          foundAssistant = true;
          schema = 'cursor';
          // Cursor transcripts carry no model/usage data at all — msg?.model/msg?.usage are
          // always undefined here, so contextTokens/contextPct/model/modelId stay null.
        }
        // Cursor entries have no per-entry "is this the final message" marker, but scanning
        // backwards already lands on the most recent (i.e. truly final) assistant entry
        // first — endTurnOnly is a no-op restriction for Cursor's schema, not a gate.
        if (text === null && !pastTurnBoundary) {
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
      // Count turns: only actual user text messages, not tool_result entries.
      if (entry.type === undefined && entry.role === 'user') {
        const content = entry.message?.content;
        const isUserText = Array.isArray(content)
          ? content.some((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
          : typeof content === 'string' && content.length > 0;
        if (isUserText) {
          turns++;
          pastTurnBoundary = true; // don't read text from a previous turn
        }
      }
      // Cursor transcripts carry no model/usage, so cost/token accumulation (legacy's
      // `entry.type === 'assistant' && entry.message?.usage ...` branch) never triggers for
      // this schema — costUsd/totalTokens stay at their zero/null defaults below.
    } catch { /* malformed line, skip */ }
  }

  return {
    text,
    model: null,
    modelId: null,
    contextPct: null,
    contextTokens: null,
    turns: turns > 0 ? turns : null,
    costUsd: null,
    totalTokens: null,
    schema,
  };
}

function toolSummary(toolName: string, input: Record<string, unknown>): string | null {
  const trunc = (s: string, n = 60) => truncate(s, n);
  switch (toolName) {
    // 'Shell' is Cursor CLI's name for its shell tool (confirmed via a real captured
    // preToolUse payload); its `command` field matches Claude Code's Bash exactly.
    case 'Shell':      return input.command   ? trunc(String(input.command).replace(/\s+/g, ' ')) : null;
    case 'Read':       return input.file_path ? trunc(String(input.file_path)) : null;
    // Cursor CLI's Write tool sends `path`, not `file_path` (confirmed via a real captured
    // preToolUse payload) — Claude Code's Write always sends `file_path`.
    case 'Write':      return (input.file_path ?? input.path) ? trunc(String(input.file_path ?? input.path)) : null;
    case 'Edit':       return input.file_path ? trunc(String(input.file_path)) : null;
    case 'Glob':       return input.pattern   ? trunc(String(input.pattern)) : null;
    case 'Grep':       return input.pattern   ? trunc(String(input.pattern)) : null;
    case 'WebFetch':   return input.url       ? trunc(String(input.url)) : null;
    case 'WebSearch':  return input.query     ? trunc(String(input.query)) : null;
    case 'Agent':      return input.subagent_type ? trunc(String(input.subagent_type)) : null;
    default:           return null;
  }
}

export const cursorDescriptor: AgentDescriptor = {
  id: 'cursor',
  displayName: 'Cursor',
  color: '#6b7cff',
  iconKey: 'cursor',
  processPattern: /cursor/i,

  matchesTranscript: (l) => typeof (l as any)?.type === 'undefined'
    && ((l as any)?.role === 'assistant' || (l as any)?.role === 'user'),
  parse,
  toolSummary,
  payload: { sessionId: ['conversation_id', 'session_id'], cwd: ['workspace_roots'] },
  sessionIdFromPayload: (p, fb) => {
    if (typeof p.conversation_id === 'string' && p.conversation_id) return p.conversation_id;
    if (typeof p.session_id === 'string' && p.session_id) return p.session_id;
    return fb;
  },
  cwdFromPayload: (p, fb) => {
    const roots = p.workspace_roots;
    if (Array.isArray(roots) && typeof roots[0] === 'string' && roots[0]) return roots[0];
    return fb;
  },

  isInstalled: (home) => existsSync(`${home}/.cursor`),
  configPath: (home) => `${home}/.cursor/hooks.json`,
  defaultConfig: () => ({ version: 1, hooks: {} }),
  installHooks: (config, hookCmd) => {
    const c = config as { version?: number; hooks?: Record<string, unknown[]> };
    c.version = c.version ?? 1;
    c.hooks = c.hooks ?? {};
    for (const [event, arg] of HOOK_EVENTS) {
      const entry = { command: hookCmd(arg) };
      const existing: unknown[] = c.hooks[event] ?? [];
      c.hooks[event] = [...existing.filter((h) => !isDashboardHook(h)), entry];
    }
  },
};
