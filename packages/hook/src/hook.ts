import * as path from 'path';
import * as os from 'os';
import { execSync } from 'child_process';
import {
  readSessions,
  writeSessions,
  upsertSession,
  Session,
  TaskSummary,
  SubagentSummary,
  readConfig,
  ModelPricingEntry,
  DEFAULT_CONTEXT_WINDOW,
  KNOWN_CONTEXT_WINDOWS,
  modelContextWindowFromConfig,
  isKnownAgentProcessArgs,
} from '@claude-dashboard/shared';

// Cursor's own agent doesn't write model/usage into its transcript files, but it does
// include them directly on the `user-prompt` and `stop` hook payloads (Claude Code's
// payload doesn't carry these — its model/usage always comes from the transcript).
export interface PayloadUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export type HookEvent =
  | {
      type: 'user-prompt';
      sessionId: string;
      pid: number;
      termSessionId: string | null;
      workingDir: string;
      transcriptPath: string | null;
      prompt: string | null;
      payloadModel: string | null;
      payloadModelId: string | null;
    }
  | {
      type: 'pre-tool';
      sessionId: string;
      pid: number;
      termSessionId: string | null;
      workingDir: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'post-tool';
      sessionId: string;
      pid: number;
      termSessionId: string | null;
      workingDir: string;
      toolName: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }
  | {
      type: 'stop';
      sessionId: string;
      pid: number;
      termSessionId: string | null;
      workingDir: string;
      transcriptPath: string | null;
      payloadModel: string | null;
      payloadModelId: string | null;
      payloadUsage: PayloadUsage | null;
    }
  | {
      type: 'notification';
      sessionId: string;
      pid: number;
      termSessionId: string | null;
      workingDir: string;
      message: string;
      notificationType?: string;
      // Set by Codex's PermissionRequest hook (packages/hook/src/hook.ts CLI entrypoint,
      // `permission-request` arg) — an unambiguous "blocked on a human" signal, unlike
      // Claude's Notification event which requires sniffing `message`/`notificationType`.
      forceStatus?: 'waiting_permission';
    };

const LOOP_THRESHOLD = 5;



function modelDisplayName(modelId: string): string {
  // Model IDs use dashes: claude-sonnet-4-6, claude-haiku-4-5-20251001
  const m = modelId.match(/(\d+)-(\d+)/);
  const version = m ? `${m[1]}.${m[2]}` : '';
  if (modelId.includes('opus'))   return version ? `Opus ${version}`   : 'Opus';
  if (modelId.includes('sonnet')) return version ? `Sonnet ${version}` : 'Sonnet';
  if (modelId.includes('haiku'))  return version ? `Haiku ${version}`  : 'Haiku';
  return modelId;
}

// Cost per million tokens (USD), by model family
// Prices: input / cache_write / cache_read / output
const MODEL_PRICING: Array<[prefix: string, pricing: ModelPricingEntry]> = [
  ['claude-opus-4',    { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75  }],
  ['claude-sonnet-4',  { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15  }],
  ['claude-haiku-4',   { input: 0.8,  cacheWrite: 1,     cacheRead: 0.08, output: 4   }],
  ['claude-opus-3',    { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75  }],
  ['claude-sonnet-3',  { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15  }],
  ['claude-haiku-3',   { input: 0.25, cacheWrite: 0.3,   cacheRead: 0.03, output: 1.25}],
];

export function modelPricingFromConfig(
  modelId: string,
  cfg?: ReturnType<typeof readConfig>,
): ModelPricingEntry | null {
  if (cfg?.modelPricing?.custom) {
    for (const c of cfg.modelPricing.custom) {
      if (modelId.startsWith(c.prefix)) {
        return { input: c.input, cacheWrite: c.cacheWrite, cacheRead: c.cacheRead, output: c.output };
      }
    }
  }
  if (cfg?.modelPricing?.fetched) {
    for (const [prefix, p] of Object.entries(cfg.modelPricing.fetched)) {
      if (modelId.startsWith(prefix)) return p;
    }
  }
  for (const [prefix, p] of MODEL_PRICING) {
    if (modelId.startsWith(prefix)) return p;
  }
  return null;
}


export function calcTurnCost(usage: Record<string, unknown>, modelId: string, cfg?: ReturnType<typeof readConfig>): number {
  const p = modelPricingFromConfig(modelId, cfg);
  if (!p) return 0;
  const inp   = typeof usage.input_tokens                === 'number' ? usage.input_tokens                : 0;
  const cw    = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
  const cr    = typeof usage.cache_read_input_tokens     === 'number' ? usage.cache_read_input_tokens     : 0;
  const out   = typeof usage.output_tokens               === 'number' ? usage.output_tokens               : 0;
  return (inp * p.input + cw * p.cacheWrite + cr * p.cacheRead + out * p.output) / 1_000_000;
}

// Turns a single turn's usage straight from Cursor's stop payload into the same
// contextPct/contextTokens/cost shape the transcript-based path produces. Cost is null
// unless the user has configured pricing for this model (Cursor's own models — e.g.
// "composer-2.5" — have no built-in entry in MODEL_PRICING).
function payloadUsageStats(
  usage: PayloadUsage,
  modelId: string | null,
  cfg?: ReturnType<typeof readConfig>,
): { contextPct: number | null; contextTokens: number | null; costUsd: number | null; tokensThisTurn: number } {
  const lastTurnTokens = usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
  const contextTokens = lastTurnTokens > 0 ? lastTurnTokens : null;
  const contextPct = modelId && lastTurnTokens > 0
    ? Math.min(100, Math.round((lastTurnTokens / modelContextWindowFromConfig(modelId, cfg)) * 100))
    : null;
  const turnCost = modelId
    ? calcTurnCost(
        {
          input_tokens: usage.inputTokens,
          output_tokens: usage.outputTokens,
          cache_read_input_tokens: usage.cacheReadTokens,
          cache_creation_input_tokens: usage.cacheWriteTokens,
        },
        modelId,
        cfg,
      )
    : 0;
  return {
    contextPct,
    contextTokens,
    costUsd: turnCost > 0 ? Math.round(turnCost * 10000) / 10000 : null,
    tokensThisTurn: usage.inputTokens + usage.outputTokens,
  };
}

interface TranscriptStats {
  text: string | null;
  model: string | null;
  modelId: string | null;
  contextPct: number | null;
  contextTokens: number | null;
  turns: number | null;
  costUsd: number | null;
  totalTokens: number | null;
  // Which transcript schema actually matched — null if the file was empty/unreadable
  // or contained no recognizable assistant entries yet. Lets callers distinguish "no
  // data because Cursor's schema never carries it" from "no data yet, still coming".
  schema: 'claude-code' | 'cursor' | 'codex' | null;
}

const EMPTY_STATS: TranscriptStats = {
  text: null, model: null, modelId: null, contextPct: null, contextTokens: null, turns: null, costUsd: null, totalTokens: null, schema: null,
};

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

function readCodexStats(lines: string[], endTurnOnly: boolean, cfg?: ReturnType<typeof readConfig>): TranscriptStats {
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

function readLastAssistantStats(transcriptPath: string, endTurnOnly = false, cfg?: ReturnType<typeof readConfig>): TranscriptStats {
  try {
    const fsSync = require('fs') as typeof import('fs');
    const content = fsSync.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    // First successfully-parsed line decides which of the three schemas this transcript
    // uses (Claude Code, Cursor, or Codex) — Codex's shape is structurally distinct enough
    // that one match is sufficient, and this avoids tangling three incompatible per-line
    // shapes into the single backward-scanning loop below.
    for (let i = lines.length - 1; i >= 0; i--) {
      let probe: unknown;
      try {
        probe = JSON.parse(lines[i]);
      } catch {
        continue;
      }
      if (isCodexRolloutEntry(probe)) return readCodexStats(lines, endTurnOnly, cfg);
      break;
    }

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
    // Cursor's own agent (not the `claude` CLI) fires the same hook events but writes
    // transcripts in a different schema: entries use `role` instead of `type` and carry no
    // model/usage/stop_reason. A turn's end is *sometimes* marked by a standalone
    // `{"type":"turn_ended"}` line, but confirmed live against a real interactive
    // cursor-agent session: it is not written reliably per turn (a two-turn session had
    // exactly one, trailing the second turn only, after an API error) — requiring it caused
    // the Stop hook to miss the first turn's response entirely and show later cards one
    // turn behind. So for Cursor's schema, the most recent assistant entry (scanning
    // backwards) is always treated as the turn's final message, regardless of endTurnOnly;
    // still track the marker (below) since it's a harmless, occasionally-present signal.
    let cursorTurnJustEnded = false;
    let schema: 'claude-code' | 'cursor' | null = null;

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'turn_ended') {
          cursorTurnJustEnded = true;
          continue;
        }
        const isClaudeAssistant = entry.type === 'assistant' && entry.message?.model !== '<synthetic>';
        const isCursorAssistant = entry.type === undefined && entry.role === 'assistant';
        if (isClaudeAssistant || isCursorAssistant) {
          const msg = entry.message;
          if (schema === null) schema = isCursorAssistant ? 'cursor' : 'claude-code';
          if (!foundAssistant) {
            foundAssistant = true;
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
          // Scan backwards within the current turn for the most recent text block.
          // Claude Code emits text and tool_use as separate assistant entries, so the
          // last entry before a tool call is tool-only — we must keep looking back.
          // When endTurnOnly=true (Stop hook), only accept the final entry (stop_reason='end_turn')
          // so we never grab an intermediate tool-use text as the session's final message.
          // Cursor entries have no such per-entry marker, but scanning backwards already
          // lands on the most recent (i.e. truly final) assistant entry first — endTurnOnly
          // is a no-op restriction for Cursor's schema, not a gate (see comment above).
          const isEndTurn = isCursorAssistant ? true : msg?.stop_reason === 'end_turn';
          if (text === null && !pastTurnBoundary && (!endTurnOnly || isEndTurn)) {
            const blocks = msg?.content;
            if (Array.isArray(blocks)) {
              for (const block of blocks) {
                if (block?.type === 'text' && typeof block.text === 'string') {
                  const t = block.text.trim().replace(/\s+/g, ' ');
                  text = t.length > 240 ? t.slice(0, 240) + '…' : t;
                  break;
                }
              }
            }
          }
        }
        // Consumed by at most the one assistant entry immediately preceding it.
        cursorTurnJustEnded = false;
        // Count turns: only actual user text messages, not tool_result entries
        // (tool results are also stored as type:'user' in the transcript)
        if (entry.type === 'user' || (entry.type === undefined && entry.role === 'user')) {
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
  } catch { /* file unreadable */ }
  return EMPTY_STATS;
}

// The transcript may be written concurrently with the Stop hook firing.
// Retry until we find stats whose text differs from the previous turn's message.
// previousMessage: the last known assistant message before this turn started.
function readLastAssistantStatsWithRetry(transcriptPath: string, previousMessage: string | null, cfg?: ReturnType<typeof readConfig>): TranscriptStats {
  for (let attempt = 0; attempt < 6; attempt++) {
    // endTurnOnly=true ensures we only accept the actual final message (stop_reason='end_turn'),
    // not an intermediate text written before a tool call (stop_reason='tool_use').
    const stats = readLastAssistantStats(transcriptPath, true, cfg);
    // Accept only if we got something new (different from the prior turn's message)
    if (stats.text && stats.text !== previousMessage) return stats;
    if (attempt < 5) {
      // synchronous sleep — hook runs as a subprocess so this doesn't block Claude
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  return EMPTY_STATS;
}

function toolSummary(toolName: string, input: Record<string, unknown>): string | null {
  const trunc = (s: string, n = 60) => s.length > n ? s.slice(0, n) + '…' : s;
  switch (toolName) {
    // 'Shell' is Cursor CLI's name for its shell tool (confirmed via a real captured
    // preToolUse payload); its `command` field matches Claude Code's Bash exactly.
    case 'Bash':
    case 'Shell':      return input.command   ? trunc(String(input.command).replace(/\s+/g, ' ')) : null;
    case 'Read':       return input.file_path ? trunc(String(input.file_path)) : null;
    // Cursor CLI's Write tool sends `path`, not `file_path` (confirmed via a real
    // captured preToolUse payload) — Claude Code's Write always sends `file_path`.
    case 'Write':      return (input.file_path ?? input.path) ? trunc(String(input.file_path ?? input.path)) : null;
    // Codex CLI's file-edit tool (confirmed via a real captured preToolUse payload):
    // tool_input.command is a patch-format string, e.g.
    // "*** Begin Patch\n*** Update File: /path/to/sample.txt\n@@\n+round 2\n*** End Patch"
    case 'apply_patch': {
      const cmd = String(input.command ?? '');
      const m = cmd.match(/\*\*\* (?:Update|Add|Delete) File: (.+)/);
      return m ? trunc(m[1]) : null;
    }
    case 'Edit':       return input.file_path ? trunc(String(input.file_path)) : null;
    case 'Glob':       return input.pattern   ? trunc(String(input.pattern)) : null;
    case 'Grep':       return input.pattern   ? trunc(String(input.pattern)) : null;
    case 'WebFetch':   return input.url       ? trunc(String(input.url)) : null;
    case 'WebSearch':  return input.query     ? trunc(String(input.query)) : null;
    case 'Agent':      return input.subagent_type ? trunc(String(input.subagent_type)) : null;
    default:           return null;
  }
}

// Prevent git from touching credentials, keychains, or system config — those
// accesses can trigger macOS TCC "access data from other apps" prompts.
const GIT_ENV = {
  ...process.env,
  GIT_TERMINAL_PROMPT: '0',
  GIT_ASKPASS: 'true',          // returns empty string — no credential lookup
  GIT_CONFIG_NOSYSTEM: '1',     // skip /etc/gitconfig
  GIT_SSH_COMMAND: 'ssh -oBatchMode=yes',
};

function getGitBranch(cwd: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, env: GIT_ENV, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function getGitAhead(cwd: string): number | null {
  try {
    const raw = execSync('git rev-list @{u}..HEAD --count', { cwd, env: GIT_ENV, stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
      .toString().trim();
    const n = parseInt(raw, 10);
    return isNaN(n) || n === 0 ? null : n;
  } catch {
    return null;
  }
}

function getGitSummary(cwd: string): string | null {
  try {
    const raw = execSync('git diff --shortstat HEAD', { cwd, env: GIT_ENV, stdio: ['pipe', 'pipe', 'pipe'], timeout: 5000 })
      .toString().trim();
    if (!raw) return null;
    // "3 files changed, 42 insertions(+), 7 deletions(-)"
    // Compact to: "3 files +42 -7"
    const files = raw.match(/(\d+) files? changed/);
    const ins   = raw.match(/(\d+) insertion/);
    const del   = raw.match(/(\d+) deletion/);
    const parts: string[] = [];
    if (files) parts.push(`${files[1]} files`);
    if (ins)   parts.push(`+${ins[1]}`);
    if (del)   parts.push(`-${del[1]}`);
    return parts.length > 0 ? parts.join(' ') : null;
  } catch {
    return null;
  }
}

function getWorktreeName(cwd: string): string | null {
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', { cwd, env: GIT_ENV, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString().trim();
    const worktreeListRaw = execSync('git worktree list --porcelain', {
      cwd, env: GIT_ENV, stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    const entries = worktreeListRaw.split('\n\n').filter(Boolean);
    // First line of the first entry is the main worktree path
    const mainMatch = entries[0]?.match(/^worktree (.+)/m);
    if (!mainMatch) return null;
    const mainPath = mainMatch[1].trim();
    // If we're not in the main worktree, return the basename of our path as the name
    return toplevel !== mainPath ? path.basename(toplevel) : null;
  } catch {
    return null;
  }
}


function makeNewSession(event: { sessionId: string; pid: number; termSessionId: string | null; workingDir: string }): Session {
  const now = Date.now();
  const branch = getGitBranch(event.workingDir);
  const worktree = getWorktreeName(event.workingDir);
  return {
    sessionId: event.sessionId,
    pid: event.pid,
    termSessionId: event.termSessionId,
    workingDir: event.workingDir,
    dirName: path.basename(event.workingDir),
    branch,
    worktree,
    status: 'idle',
    currentTool: null,
    lastTool: null,
    lastToolAt: null,
    lastToolSummary: null,
    lastPrompt: null,
    lastMessage: null,
    currentTask: null,
    tasks: [],
    subagents: [],
    completionPct: 0,
    changedFiles: null,
    costUsd: null,
    turns: null,
    toolCount: 0,
    totalTokens: null,
    model: null,
    modelId: null,
    contextPct: null,
    contextTokens: null,
    bashStartedAt: null,
    gitSummary: null,
    gitAhead: null,
    transcriptPath: null,
    partialResponse: null,
    errorState: false,
    loopTool: null,
    loopCount: 0,
    startedAt: now,
    turnStartedAt: now,
    lastActivity: now,
    dismissed: false,
  };
}

export function processHookEvent(event: HookEvent, sessionsFile: string, cfg?: ReturnType<typeof readConfig>): void {
  const sessions = readSessions(sessionsFile);
  const existing = sessions.find((s) => s.sessionId === event.sessionId);
  let session: Session = existing ?? makeNewSession(event);
  // Always refresh pid and termSessionId — pid may have changed if Claude restarted
  session = {
    ...session,
    pid: event.pid,
    ...(event.termSessionId ? { termSessionId: event.termSessionId } : {}),
  };
  // Un-dismiss a session when it becomes active again
  if (session.dismissed && event.type !== 'stop') {
    session = { ...session, dismissed: false };
  }

  const now = Date.now();

  // Reset loop detection on every new user turn
  if (event.type === 'user-prompt' || event.type === 'stop') {
    session = { ...session, loopTool: null, loopCount: 0, errorState: false };
  }

  if (event.type === 'user-prompt') {
    // Transcript is fully written by the time the NEXT prompt is submitted,
    // so read it here to capture the previous turn's response + model/context/cost stats.
    // Cursor's own payload doesn't always carry transcript_path (confirmed live: it's
    // frequently null early in a conversation even though the file already exists), so
    // fall back to the path we already learned from an earlier event on this session.
    const userPromptTranscriptPath = event.transcriptPath ?? session.transcriptPath;
    const stats = userPromptTranscriptPath
      ? readLastAssistantStats(userPromptTranscriptPath, false, cfg)
      : EMPTY_STATS;
    // Refresh branch/worktree on each turn in case session was created before worktree was set up
    const freshBranch   = getGitBranch(event.workingDir);
    const freshWorktree = getWorktreeName(event.workingDir);
    session = {
      ...session,
      status: 'active',
      lastActivity: now,
      turnStartedAt: now,
      partialResponse: null,
      // Only overwrite branch if we got a valid value — null means git unavailable, keep old
      ...(freshBranch ? { branch: freshBranch } : {}),
      worktree: freshWorktree,
      ...(event.transcriptPath ? { transcriptPath: event.transcriptPath } : {}),
      ...(event.prompt && !event.prompt.startsWith('<') ? { lastPrompt: event.prompt } : {}),
      ...(stats.text ? { lastMessage: stats.text } : {}),
      ...(stats.model ? { model: stats.model } : {}),
      ...(stats.modelId ? { modelId: stats.modelId } : {}),
      ...(stats.contextPct !== null ? { contextPct: stats.contextPct } : {}),
      ...(stats.contextTokens !== null ? { contextTokens: stats.contextTokens } : {}),
      ...(stats.turns !== null ? { turns: stats.turns } : {}),
      ...(stats.costUsd !== null ? { costUsd: stats.costUsd } : {}),
      ...(stats.totalTokens !== null ? { totalTokens: stats.totalTokens } : {}),
      ...(stats.schema === 'cursor' || stats.schema === 'codex' ? { source: stats.schema } : {}),
      // Cursor's own agent carries model directly on the payload (no transcript data);
      // only apply it when the transcript didn't already give us a model this turn.
      ...(!stats.model && event.payloadModel ? { model: event.payloadModel } : {}),
      ...(!stats.modelId && (event.payloadModelId ?? event.payloadModel) ? { modelId: event.payloadModelId ?? event.payloadModel } : {}),
    };
  } else if (event.type === 'pre-tool') {
    let loopTool = session.loopTool;
    let loopCount = session.loopCount;
    if (loopTool === event.toolName) {
      loopCount++;
    } else {
      loopTool = event.toolName;
      loopCount = 1;
    }
    const newErrorState = loopCount >= LOOP_THRESHOLD ? true : session.errorState;
    session = { ...session, loopTool, loopCount, errorState: newErrorState, toolCount: session.toolCount + 1 };

    // Read full transcript stats: model, contextPct, turns, cost, tokens, and partial text.
    // Ignore partial text if it matches lastMessage — transcript not yet updated this turn.
    const stats = session.transcriptPath
      ? readLastAssistantStats(session.transcriptPath, false, cfg)
      : EMPTY_STATS;
    const freshPartial = stats.text && stats.text !== session.lastMessage ? stats.text : null;

    session = {
      ...session,
      status: 'active',
      currentTool: event.toolName,
      lastActivity: now,
      ...(freshPartial ? { partialResponse: freshPartial } : {}),
      ...(stats.contextPct !== null ? { contextPct: stats.contextPct } : {}),
      ...(stats.contextTokens !== null ? { contextTokens: stats.contextTokens } : {}),
      ...(stats.model ? { model: stats.model } : {}),
      ...(stats.modelId ? { modelId: stats.modelId } : {}),
      ...(stats.turns !== null ? { turns: stats.turns } : {}),
      ...(stats.costUsd !== null ? { costUsd: stats.costUsd } : {}),
      ...(stats.totalTokens !== null ? { totalTokens: stats.totalTokens } : {}),
      ...(stats.schema === 'cursor' || stats.schema === 'codex' ? { source: stats.schema } : {}),
      // Track when Bash starts so we can detect stuck commands
      ...(event.toolName === 'Bash' ? { bashStartedAt: now } : {}),
    };
  } else if (event.type === 'post-tool') {
    const toolName = event.toolName;

    // Reset loop counter on task state change
    if (toolName === 'TaskCreate' || toolName === 'TaskUpdate') {
      session = { ...session, errorState: false, loopTool: null, loopCount: 0 };
    }

    let tasks = session.tasks;
    let subagents = session.subagents;

    if (toolName === 'TaskCreate') {
      const output = event.output as { id?: string; subject?: string };
      if (output.id) {
        const task: TaskSummary = {
          id: output.id,
          subject: output.subject ?? '',
          status: 'pending',
        };
        tasks = [...tasks.filter((t) => t.id !== output.id), task];
      }
    } else if (toolName === 'TaskUpdate') {
      const output = event.output as { id?: string; status?: TaskSummary['status'] };
      if (output.id) {
        tasks = tasks.map((t) =>
          t.id === output.id ? { ...t, status: output.status ?? t.status } : t
        );
      }
    } else if (toolName === 'Agent') {
      const input = event.input as { subagent_type?: string };
      const agentId = `${event.sessionId}-agent-${now}`;
      const subagent: SubagentSummary = {
        id: agentId,
        type: input.subagent_type ?? 'general-purpose',
        status: 'done',
      };
      subagents = [...subagents.filter((a) => a.id !== agentId), subagent];
    }

    const completed = tasks.filter((t) => t.status === 'completed').length;
    const completionPct = tasks.length > 0 ? Math.round((completed / tasks.length) * 100) : 0;
    const currentTask = tasks.find((t) => t.status === 'in_progress')?.subject ?? null;

    // Transcript is written between PreToolUse and PostToolUse, so read it now
    // to capture the text Claude wrote before this tool call.
    const postStats = session.transcriptPath
      ? readLastAssistantStats(session.transcriptPath, false, cfg)
      : EMPTY_STATS;
    const freshPostPartial = postStats.text && postStats.text !== session.lastMessage ? postStats.text : null;

    session = {
      ...session,
      currentTool: null,
      lastTool: event.toolName,
      lastToolAt: now,
      lastToolSummary: toolSummary(event.toolName, event.input),
      lastActivity: now,
      tasks,
      subagents,
      completionPct,
      currentTask,
      ...(freshPostPartial ? { partialResponse: freshPostPartial } : {}),
      ...(postStats.schema === 'cursor' || postStats.schema === 'codex' ? { source: postStats.schema } : {}),
      // Clear bash timer when Bash completes
      ...(event.toolName === 'Bash' ? { bashStartedAt: null } : {}),
    };
  } else if (event.type === 'stop') {
    // Same fallback as user-prompt above: Cursor's stop payload doesn't always carry
    // transcript_path even when the transcript file exists (confirmed live), so use the
    // path already known from an earlier event on this session if the current one lacks it.
    const stopTranscriptPath = event.transcriptPath ?? session.transcriptPath;
    const stats = stopTranscriptPath
      ? readLastAssistantStatsWithRetry(stopTranscriptPath, session.lastMessage, cfg)
      : EMPTY_STATS;
    const gitSummary = getGitSummary(event.workingDir);
    const gitAhead = getGitAhead(event.workingDir);
    // Cursor: no transcript usage data, so derive contextPct/tokens/cost from the
    // payload's per-turn usage instead. Only used when the transcript path came up empty
    // (Claude Code sessions always have transcript stats, so this is a no-op for them).
    // Falls back to payloadModel (Cursor's `model` field) when model_id is absent —
    // confirmed live: cursor-agent's interactive-mode payload sends `model` (e.g.
    // "cursor-grok-4.6-high-fast") without `model_id` at all. modelContextWindowFromConfig
    // always returns a usable window (falls back to DEFAULT_CONTEXT_WINDOW for unrecognized
    // strings), so any non-null identifier is enough to compute an approximate contextPct
    // instead of leaving it null forever.
    const payloadModelId = stats.modelId ?? event.payloadModelId ?? event.payloadModel;
    const payloadStats = event.payloadUsage
      ? payloadUsageStats(event.payloadUsage, payloadModelId, cfg)
      : null;
    session = {
      ...session,
      status: 'done',
      currentTool: null,
      bashStartedAt: null,
      partialResponse: null,
      lastActivity: now,
      ...(stats.text ? { lastMessage: stats.text } : {}),
      ...(stats.model ? { model: stats.model } : {}),
      ...(stats.modelId ? { modelId: stats.modelId } : {}),
      ...(stats.contextPct !== null ? { contextPct: stats.contextPct } : {}),
      ...(stats.contextTokens !== null ? { contextTokens: stats.contextTokens } : {}),
      ...(stats.turns !== null ? { turns: stats.turns } : {}),
      ...(stats.costUsd !== null ? { costUsd: stats.costUsd } : {}),
      ...(stats.totalTokens !== null ? { totalTokens: stats.totalTokens } : {}),
      ...(stats.schema === 'cursor' || stats.schema === 'codex' ? { source: stats.schema } : {}),
      ...(!stats.model && event.payloadModel ? { model: event.payloadModel } : {}),
      // Falls back to payloadModel here too, matching the payloadModelId computation above —
      // so Settings > Cost tab custom pricing/context-window prefixes (keyed on modelId) can
      // still match when Cursor never sends a distinct model_id.
      ...(!stats.modelId && (event.payloadModelId ?? event.payloadModel) ? { modelId: event.payloadModelId ?? event.payloadModel } : {}),
      ...(stats.contextPct === null && payloadStats
        ? { contextPct: payloadStats.contextPct, contextTokens: payloadStats.contextTokens }
        : {}),
      ...(stats.costUsd === null && payloadStats && payloadStats.costUsd !== null
        ? { costUsd: Math.round(((session.costUsd ?? 0) + payloadStats.costUsd) * 10000) / 10000 }
        : {}),
      ...(stats.totalTokens === null && payloadStats
        ? { totalTokens: (session.totalTokens ?? 0) + payloadStats.tokensThisTurn }
        : {}),
      gitSummary,
      gitAhead,
    };
  } else if (event.type === 'notification') {
    if (event.forceStatus) {
      session = { ...session, status: event.forceStatus, lastActivity: now };
    } else {
      const nt = (event.notificationType ?? '').toLowerCase();
      if (nt.includes('permission')) {
        session = { ...session, status: 'waiting_permission', lastActivity: now };
      } else if (nt.includes('input')) {
        session = { ...session, status: 'waiting_input', lastActivity: now };
      }
    }
  }

  const updated = upsertSession(sessions, session);
  writeSessions(sessionsFile, updated);
}

// Claude Code's hook payload always includes `cwd`. Cursor's never does, and when no
// folder is open in the Cursor window, `workspace_roots` (the one cwd-adjacent field it
// does send) is also empty — in that case there's no real project directory to report,
// so we fall back to the hook process's own cwd, which lands wherever Cursor happens to
// run hook commands from (observed: the directory containing ~/.claude/settings.json,
// which is where it discovers the hook registration — not the conversation's workspace).
export function resolveCwd(payload: Record<string, unknown>, fallbackCwd: string): string {
  if (typeof payload.cwd === 'string' && payload.cwd) return payload.cwd;
  const roots = payload.workspace_roots;
  if (Array.isArray(roots) && typeof roots[0] === 'string' && roots[0]) return roots[0];
  return fallbackCwd;
}

// Claude Code's payload always includes `session_id`. Cursor's native payload (both the
// IDE and the `cursor-agent` CLI) carries `conversation_id` instead — falling straight to
// the CLAUDE_SESSION_ID-derived default would collapse every Cursor session into the same
// 'unknown' record.
export function resolveSessionId(payload: Record<string, unknown>, fallbackSessionId: string): string {
  if (typeof payload.session_id === 'string' && payload.session_id) return payload.session_id;
  if (typeof payload.conversation_id === 'string' && payload.conversation_id) return payload.conversation_id;
  return fallbackSessionId;
}

// Walk up the process tree to find Claude Code's PID.
// The depth varies: hook may be a direct child of Claude, or via an intermediate shell.
// Walk upward looking for the first ancestor whose args contain "claude".
function getClaudePid(): number {
  try {
    let pid = process.ppid ?? process.pid;
    for (let i = 0; i < 5; i++) {
      if (!pid || pid <= 1) break;
      const args = execSync(`ps -o args= -p ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] })
        .toString().trim();
      if (isKnownAgentProcessArgs(args)) return pid;
      const ppidStr = execSync(`ps -o ppid= -p ${pid}`, { stdio: ['pipe', 'pipe', 'pipe'] })
        .toString().trim();
      const ppid = parseInt(ppidStr);
      if (!ppid || ppid <= 1 || ppid === pid) break;
      pid = ppid;
    }
  } catch {
    // fall through
  }
  return process.ppid ?? process.pid;
}

// CLI entrypoint
if (require.main === module) {
  const eventType = process.argv[2];
  const sessionId = process.env.CLAUDE_SESSION_ID ?? 'unknown';
  const pid = getClaudePid();
  const workingDir = process.env.PWD ?? process.cwd();
  // iTerm2 injects TERM_SESSION_ID; inherited by Claude Code and its children
  const termSessionId = process.env.TERM_SESSION_ID ?? null;
  const sessionsFile = path.join(os.homedir(), '.config', 'claude-dashboard', 'sessions.json');
  const configFile = path.join(os.homedir(), '.config', 'claude-dashboard', 'config.json');
  const dashConfig = readConfig(configFile);

  let stdinData = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (chunk) => (stdinData += chunk));
  process.stdin.on('end', () => {
    let payload: Record<string, unknown> = {};
    try {
      payload = stdinData ? JSON.parse(stdinData) : {};
    } catch {
      // silently ignore malformed stdin
    }

    // Claude Code passes session_id and cwd in the stdin JSON payload
    const resolvedSessionId = resolveSessionId(payload, sessionId);
    const resolvedPid = typeof payload.pid === 'number' ? payload.pid : pid;
    const resolvedCwd = resolveCwd(payload, workingDir);

    let event: HookEvent;
    if (eventType === 'user-prompt') {
      const rawPrompt = (payload.prompt as string) ?? null;
      const trimmed = rawPrompt?.trim() ?? null;
      const prompt = trimmed && !trimmed.startsWith('<')
        ? trimmed.replace(/\s+/g, ' ').slice(0, 120) + (trimmed.length > 120 ? '…' : '')
        : null;
      event = {
        type: 'user-prompt',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        transcriptPath: (payload.transcript_path as string) ?? null,
        prompt,
        payloadModel: typeof payload.model === 'string' ? payload.model : null,
        payloadModelId: typeof payload.model_id === 'string' ? payload.model_id : null,
      };
    } else if (eventType === 'pre-tool') {
      event = {
        type: 'pre-tool',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        toolName: (payload.tool_name as string) ?? '',
        input: (payload.tool_input as Record<string, unknown>) ?? {},
      };
    } else if (eventType === 'post-tool') {
      event = {
        type: 'post-tool',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        toolName: (payload.tool_name as string) ?? '',
        input: (payload.tool_input as Record<string, unknown>) ?? {},
        // Cursor CLI's postToolUse payload carries `tool_output` (confirmed via a real
        // captured payload — as a JSON string, not an object), not Claude Code's
        // `tool_response`. Nothing currently reads Cursor's tool output contents (the only
        // consumer, TaskCreate/TaskUpdate parsing, is Claude-only), so no parsing needed here.
        output: (payload.tool_response ?? payload.tool_output) as Record<string, unknown> ?? {},
      };
    } else if (eventType === 'stop') {
      // Cursor's stop payload carries this turn's usage directly (Claude Code's payload
      // never does — its usage always comes from the transcript instead).
      const hasPayloadUsage =
        typeof payload.input_tokens === 'number' || typeof payload.output_tokens === 'number';
      event = {
        type: 'stop',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        transcriptPath: (payload.transcript_path as string) ?? null,
        payloadModel: typeof payload.model === 'string' ? payload.model : null,
        payloadModelId: typeof payload.model_id === 'string' ? payload.model_id : null,
        payloadUsage: hasPayloadUsage
          ? {
              inputTokens: typeof payload.input_tokens === 'number' ? payload.input_tokens : 0,
              outputTokens: typeof payload.output_tokens === 'number' ? payload.output_tokens : 0,
              cacheReadTokens: typeof payload.cache_read_tokens === 'number' ? payload.cache_read_tokens : 0,
              cacheWriteTokens: typeof payload.cache_write_tokens === 'number' ? payload.cache_write_tokens : 0,
            }
          : null,
      };
    } else if (eventType === 'permission-request') {
      event = {
        type: 'notification',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        message: '',
        forceStatus: 'waiting_permission',
      };
    } else {
      event = {
        type: 'notification',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        message: (payload.message as string) ?? '',
        notificationType: (payload.notification_type ?? payload.type) as string | undefined,
      };
    }

    try {
      const fsSync = require('fs');
      const dir = path.dirname(sessionsFile);
      if (!fsSync.existsSync(dir)) fsSync.mkdirSync(dir, { recursive: true });
      processHookEvent(event, sessionsFile, dashConfig);
    } catch {
      // Hook failures must be silent to avoid blocking Claude sessions
      process.exit(0);
    }
  });
}
