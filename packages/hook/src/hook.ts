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
  modelContextWindowFromConfig,
  isKnownAgentProcessArgs,
  calcTurnCost,
  getAgentById,
  probeAgent,
  safeParseLines,
  claudeCodeDescriptor,
  AgentDescriptor,
  TranscriptStats,
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

const EMPTY_STATS: TranscriptStats = {
  text: null, model: null, modelId: null, contextPct: null, contextTokens: null, turns: null, costUsd: null, totalTokens: null, schema: null,
};

// Read a transcript file and delegate parsing to the resolved agent's descriptor. An
// unreadable/missing file yields EMPTY_STATS, matching the previous inline parser's behavior
// where a failed read produced empty stats rather than throwing.
function parseTranscript(
  agent: AgentDescriptor,
  transcriptPath: string,
  endTurnOnly: boolean,
  cfg?: ReturnType<typeof readConfig>,
): TranscriptStats {
  try {
    const content = require('fs').readFileSync(transcriptPath, 'utf8') as string;
    return agent.parse(safeParseLines(content), endTurnOnly, cfg);
  } catch {
    return EMPTY_STATS;
  }
}

// The transcript may be written concurrently with the Stop hook firing.
// Retry until we find stats whose text differs from the previous turn's message.
// previousMessage: the last known assistant message before this turn started.
function readLastAssistantStatsWithRetry(
  transcriptPath: string,
  previousMessage: string | null,
  cfg: ReturnType<typeof readConfig> | undefined,
  agent: AgentDescriptor,
): TranscriptStats {
  for (let attempt = 0; attempt < 6; attempt++) {
    // endTurnOnly=true ensures we only accept the actual final message (stop_reason='end_turn'),
    // not an intermediate text written before a tool call (stop_reason='tool_use').
    const stats = parseTranscript(agent, transcriptPath, true, cfg);
    // Accept only if we got something new (different from the prior turn's message)
    if (stats.text && stats.text !== previousMessage) return stats;
    if (attempt < 5) {
      // synchronous sleep — hook runs as a subprocess so this doesn't block Claude
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  return EMPTY_STATS;
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

export function processHookEvent(
  event: HookEvent,
  sessionsFile: string,
  cfg?: ReturnType<typeof readConfig>,
  agent: AgentDescriptor = claudeCodeDescriptor,
): void {
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
      ? parseTranscript(agent, userPromptTranscriptPath, false, cfg)
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
      source: agent.id as Session['source'],
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
      ? parseTranscript(agent, session.transcriptPath, false, cfg)
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
      source: agent.id as Session['source'],
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
      ? parseTranscript(agent, session.transcriptPath, false, cfg)
      : EMPTY_STATS;
    const freshPostPartial = postStats.text && postStats.text !== session.lastMessage ? postStats.text : null;

    session = {
      ...session,
      currentTool: null,
      lastTool: event.toolName,
      lastToolAt: now,
      lastToolSummary: agent.toolSummary(event.toolName, event.input),
      lastActivity: now,
      tasks,
      subagents,
      completionPct,
      currentTask,
      ...(freshPostPartial ? { partialResponse: freshPostPartial } : {}),
      source: agent.id as Session['source'],
      // Clear bash timer when Bash completes
      ...(event.toolName === 'Bash' ? { bashStartedAt: null } : {}),
    };
  } else if (event.type === 'stop') {
    // Same fallback as user-prompt above: Cursor's stop payload doesn't always carry
    // transcript_path even when the transcript file exists (confirmed live), so use the
    // path already known from an earlier event on this session if the current one lacks it.
    const stopTranscriptPath = event.transcriptPath ?? session.transcriptPath;
    const stats = stopTranscriptPath
      ? readLastAssistantStatsWithRetry(stopTranscriptPath, session.lastMessage, cfg, agent)
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
      source: agent.id as Session['source'],
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

// Resolve which agent's descriptor drives this hook invocation. The installed hook command
// carries an explicit `--agent=<id>` flag (see the install step), which wins when it names a
// known agent. Older installs predate the flag, so we fall back to probing the transcript:
// scan its lines (newest first) and use the first line whose shape a descriptor recognizes.
// Last resort is Claude Code, the original single-agent behavior.
export function resolveAgent(transcriptPath: string | null, flag: string | null): AgentDescriptor {
  if (flag) {
    const byFlag = getAgentById(flag);
    if (byFlag) return byFlag;
  }
  if (transcriptPath) {
    try {
      const content = require('fs').readFileSync(transcriptPath, 'utf8') as string;
      const lines = safeParseLines(content);
      for (let i = lines.length - 1; i >= 0; i--) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(lines[i]);
        } catch {
          continue;
        }
        const probed = probeAgent(parsed);
        if (probed) return probed;
      }
    } catch {
      /* transcript unreadable — fall through to the default */
    }
  }
  return getAgentById('claude-code')!;
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
  // The installed hook command tags each invocation with the agent it belongs to; resolveAgent
  // falls back to probing the transcript for older installs that predate the flag.
  const agentFlag = process.argv.find((a) => a.startsWith('--agent='))?.split('=')[1] ?? null;
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

    // Resolve the agent from the --agent flag (probe fallback), then use its descriptor to
    // pull the session id / cwd out of the payload — each agent names those fields differently
    // (Claude Code: session_id/cwd; Cursor: conversation_id/workspace_roots).
    const transcriptPathForResolve =
      typeof payload.transcript_path === 'string' ? payload.transcript_path : null;
    const agent = resolveAgent(transcriptPathForResolve, agentFlag);
    const resolvedSessionId = agent.sessionIdFromPayload(payload, sessionId);
    const resolvedPid = typeof payload.pid === 'number' ? payload.pid : pid;
    const resolvedCwd = agent.cwdFromPayload(payload, workingDir);

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
      processHookEvent(event, sessionsFile, dashConfig, agent);
    } catch {
      // Hook failures must be silent to avoid blocking Claude sessions
      process.exit(0);
    }
  });
}
