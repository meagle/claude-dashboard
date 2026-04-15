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
} from '@claude-dashboard/shared';

export type HookEvent =
  | {
      type: 'user-prompt';
      sessionId: string;
      pid: number;
      termSessionId: string | null;
      workingDir: string;
      transcriptPath: string | null;
      prompt: string | null;
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
    }
  | {
      type: 'notification';
      sessionId: string;
      pid: number;
      termSessionId: string | null;
      workingDir: string;
      message: string;
      notificationType?: string;
    };

const LOOP_THRESHOLD = 5;

// Context window sizes by model family (tokens)
const MODEL_CONTEXT: Record<string, number> = {
  'claude-opus':   200_000,
  'claude-sonnet': 200_000,
  'claude-haiku':  200_000,
};

function modelContextWindow(modelId: string): number {
  for (const [prefix, size] of Object.entries(MODEL_CONTEXT)) {
    if (modelId.startsWith(prefix)) return size;
  }
  return 200_000; // safe default
}

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
interface ModelPricing {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}
const MODEL_PRICING: Array<[prefix: string, pricing: ModelPricing]> = [
  ['claude-opus-4',    { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75  }],
  ['claude-sonnet-4',  { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15  }],
  ['claude-haiku-4',   { input: 0.8,  cacheWrite: 1,     cacheRead: 0.08, output: 4   }],
  ['claude-opus-3',    { input: 15,   cacheWrite: 18.75, cacheRead: 1.5,  output: 75  }],
  ['claude-sonnet-3',  { input: 3,    cacheWrite: 3.75,  cacheRead: 0.3,  output: 15  }],
  ['claude-haiku-3',   { input: 0.25, cacheWrite: 0.3,   cacheRead: 0.03, output: 1.25}],
];

function modelPricing(modelId: string): ModelPricing | null {
  for (const [prefix, p] of MODEL_PRICING) {
    if (modelId.startsWith(prefix)) return p;
  }
  return null;
}

function calcTurnCost(usage: Record<string, unknown>, modelId: string): number {
  const p = modelPricing(modelId);
  if (!p) return 0;
  const inp   = typeof usage.input_tokens                === 'number' ? usage.input_tokens                : 0;
  const cw    = typeof usage.cache_creation_input_tokens === 'number' ? usage.cache_creation_input_tokens : 0;
  const cr    = typeof usage.cache_read_input_tokens     === 'number' ? usage.cache_read_input_tokens     : 0;
  const out   = typeof usage.output_tokens               === 'number' ? usage.output_tokens               : 0;
  return (inp * p.input + cw * p.cacheWrite + cr * p.cacheRead + out * p.output) / 1_000_000;
}

interface TranscriptStats {
  text: string | null;
  model: string | null;
  contextPct: number | null;
  turns: number | null;
  costUsd: number | null;
  totalTokens: number | null;
}

function readLastAssistantStats(transcriptPath: string): TranscriptStats {
  try {
    const fsSync = require('fs') as typeof import('fs');
    const content = fsSync.readFileSync(transcriptPath, 'utf8');
    const lines = content.split('\n').filter(Boolean);

    let text: string | null = null;
    let model: string | null = null;
    let contextPct: number | null = null;
    let turns = 0;
    let costUsd = 0;
    let cumulativeTokens = 0;
    let foundAssistant = false;

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (!foundAssistant && entry.type === 'assistant') {
          foundAssistant = true;
          const msg = entry.message;
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
          const modelId: string | null = typeof msg?.model === 'string' ? msg.model : null;
          const u = msg?.usage ?? {};
          const lastTurnTokens =
            (typeof u.input_tokens                === 'number' ? u.input_tokens                : 0) +
            (typeof u.cache_read_input_tokens     === 'number' ? u.cache_read_input_tokens     : 0) +
            (typeof u.cache_creation_input_tokens === 'number' ? u.cache_creation_input_tokens : 0);
          contextPct = modelId && lastTurnTokens > 0
            ? Math.min(100, Math.round((lastTurnTokens / modelContextWindow(modelId)) * 100))
            : null;
          model = modelId ? modelDisplayName(modelId) : null;
        }
        // Count turns: only actual user text messages, not tool_result entries
        // (tool results are also stored as type:'user' in the transcript)
        if (entry.type === 'user') {
          const content = entry.message?.content;
          const isUserText = Array.isArray(content)
            ? content.some((b: unknown) => (b as Record<string, unknown>)?.type === 'text')
            : typeof content === 'string' && content.length > 0;
          if (isUserText) turns++;
        }
        if (entry.type === 'assistant' && entry.message?.usage && entry.message?.model) {
          costUsd += calcTurnCost(entry.message.usage as Record<string, unknown>, entry.message.model as string);
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
      contextPct,
      turns: turns > 0 ? turns : null,
      costUsd: costUsd > 0 ? Math.round(costUsd * 10000) / 10000 : null,
      totalTokens: cumulativeTokens > 0 ? cumulativeTokens : null,
    };
  } catch { /* file unreadable */ }
  return { text: null, model: null, contextPct: null, turns: null, costUsd: null, totalTokens: null };
}

// The transcript may be written concurrently with the Stop hook firing.
// Retry until we find stats whose text differs from the previous turn's message.
// previousMessage: the last known assistant message before this turn started.
function readLastAssistantStatsWithRetry(transcriptPath: string, previousMessage: string | null): TranscriptStats {
  for (let attempt = 0; attempt < 6; attempt++) {
    const stats = readLastAssistantStats(transcriptPath);
    // Accept only if we got something new (different from the prior turn's message)
    if (stats.text && stats.text !== previousMessage) return stats;
    if (attempt < 5) {
      // synchronous sleep — hook runs as a subprocess so this doesn't block Claude
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
    }
  }
  return { text: null, model: null, contextPct: null, turns: null, costUsd: null, totalTokens: null };
}

function toolSummary(toolName: string, input: Record<string, unknown>): string | null {
  const trunc = (s: string, n = 60) => s.length > n ? s.slice(0, n) + '…' : s;
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

function readPartialResponse(transcriptPath: string): string | null {
  try {
    const fsSync = require('fs') as typeof import('fs');
    const lines = fsSync.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.type === 'assistant') {
          const blocks = entry.message?.content;
          if (Array.isArray(blocks)) {
            for (const block of blocks) {
              if (block?.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
                const t = block.text.trim().replace(/\s+/g, ' ');
                return t.length > 240 ? t.slice(0, 240) + '…' : t;
              }
            }
          }
        }
      } catch { /* skip */ }
    }
  } catch { /* unreadable */ }
  return null;
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
    contextPct: null,
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

export function processHookEvent(event: HookEvent, sessionsFile: string): void {
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
    const stats = event.transcriptPath
      ? readLastAssistantStats(event.transcriptPath)
      : { text: null, model: null, contextPct: null, turns: null, costUsd: null, totalTokens: null };
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
      ...(event.prompt ? { lastPrompt: event.prompt } : {}),
      ...(stats.text ? { lastMessage: stats.text } : {}),
      ...(stats.model ? { model: stats.model } : {}),
      ...(stats.contextPct !== null ? { contextPct: stats.contextPct } : {}),
      ...(stats.turns !== null ? { turns: stats.turns } : {}),
      ...(stats.costUsd !== null ? { costUsd: stats.costUsd } : {}),
      ...(stats.totalTokens !== null ? { totalTokens: stats.totalTokens } : {}),
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

    // Read partial assistant text from transcript (what Claude wrote before calling this tool).
    // Ignore if it matches lastMessage — that means the transcript hasn't been updated yet
    // for this turn and we'd be showing the previous turn's response.
    const partial = session.transcriptPath ? readPartialResponse(session.transcriptPath) : null;
    const freshPartial = partial && partial !== session.lastMessage ? partial : null;

    session = {
      ...session,
      status: 'active',
      currentTool: event.toolName,
      lastActivity: now,
      ...(freshPartial ? { partialResponse: freshPartial } : {}),
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
      // Clear bash timer when Bash completes
      ...(event.toolName === 'Bash' ? { bashStartedAt: null } : {}),
    };
  } else if (event.type === 'stop') {
    const stats = event.transcriptPath
      ? readLastAssistantStatsWithRetry(event.transcriptPath, session.lastMessage)
      : { text: null, model: null, contextPct: null, turns: null, costUsd: null, totalTokens: null };
    const gitSummary = getGitSummary(event.workingDir);
    const gitAhead = getGitAhead(event.workingDir);
    session = {
      ...session,
      status: 'done',
      currentTool: null,
      bashStartedAt: null,
      partialResponse: null,
      lastActivity: now,
      ...(stats.text ? { lastMessage: stats.text } : {}),
      ...(stats.model ? { model: stats.model } : {}),
      ...(stats.contextPct !== null ? { contextPct: stats.contextPct } : {}),
      ...(stats.turns !== null ? { turns: stats.turns } : {}),
      ...(stats.costUsd !== null ? { costUsd: stats.costUsd } : {}),
      ...(stats.totalTokens !== null ? { totalTokens: stats.totalTokens } : {}),
      ...(gitSummary ? { gitSummary } : {}),
      ...(gitAhead !== null ? { gitAhead } : {}),
    };
  } else if (event.type === 'notification') {
    const nt = (event.notificationType ?? '').toLowerCase();
    if (nt.includes('permission')) {
      session = { ...session, status: 'waiting_permission', lastActivity: now };
    } else if (nt.includes('input')) {
      session = { ...session, status: 'waiting_input', lastActivity: now };
    }
  }

  const updated = upsertSession(sessions, session);
  writeSessions(sessionsFile, updated);
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
      if (args.toLowerCase().includes('claude')) return pid;
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
  const eventType = process.argv[2] as HookEvent['type'];
  const sessionId = process.env.CLAUDE_SESSION_ID ?? 'unknown';
  const pid = getClaudePid();
  const workingDir = process.env.PWD ?? process.cwd();
  // iTerm2 injects TERM_SESSION_ID; inherited by Claude Code and its children
  const termSessionId = process.env.TERM_SESSION_ID ?? null;
  const sessionsFile = path.join(os.homedir(), '.config', 'claude-dashboard', 'sessions.json');

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
    const resolvedSessionId = (payload.session_id as string) ?? sessionId;
    const resolvedPid = typeof payload.pid === 'number' ? payload.pid : pid;
    const resolvedCwd = (payload.cwd as string) ?? workingDir;

    let event: HookEvent;
    if (eventType === 'user-prompt') {
      const rawPrompt = (payload.prompt as string) ?? null;
      const prompt = rawPrompt
        ? rawPrompt.trim().replace(/\s+/g, ' ').slice(0, 120) + (rawPrompt.length > 120 ? '…' : '')
        : null;
      event = {
        type: 'user-prompt',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        transcriptPath: (payload.transcript_path as string) ?? null,
        prompt,
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
        output: (payload.tool_response as Record<string, unknown>) ?? {},
      };
    } else if (eventType === 'stop') {
      event = {
        type: 'stop',
        sessionId: resolvedSessionId,
        pid: resolvedPid,
        termSessionId,
        workingDir: resolvedCwd,
        transcriptPath: (payload.transcript_path as string) ?? null,
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
      processHookEvent(event, sessionsFile);
    } catch {
      // Hook failures must be silent to avoid blocking Claude sessions
      process.exit(0);
    }
  });
}
