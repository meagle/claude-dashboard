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
      type: 'pre-tool';
      sessionId: string;
      pid: number;
      workingDir: string;
      toolName: string;
      input: Record<string, unknown>;
    }
  | {
      type: 'post-tool';
      sessionId: string;
      pid: number;
      workingDir: string;
      toolName: string;
      input: Record<string, unknown>;
      output: Record<string, unknown>;
    }
  | {
      type: 'stop';
      sessionId: string;
      pid: number;
      workingDir: string;
    }
  | {
      type: 'notification';
      sessionId: string;
      pid: number;
      workingDir: string;
      message: string;
      notificationType?: string;
    };

const LOOP_THRESHOLD = 5;

function getGitBranch(cwd: string): string | null {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

function getWorktreeBranch(cwd: string): string | null {
  try {
    const toplevel = execSync('git rev-parse --show-toplevel', { cwd, stdio: ['pipe', 'pipe', 'pipe'] })
      .toString()
      .trim();
    const worktreeListRaw = execSync('git worktree list --porcelain', {
      cwd,
      stdio: ['pipe', 'pipe', 'pipe'],
    }).toString();
    const entries = worktreeListRaw.split('\n\n').filter(Boolean);
    // First entry is always the main worktree; linked worktrees are the rest
    const linkedEntries = entries.slice(1);
    const isLinked = linkedEntries.some((e) => e.includes('worktree ' + toplevel));
    if (isLinked) {
      return getGitBranch(cwd);
    }
    return null;
  } catch {
    return null;
  }
}

function makeNewSession(event: { sessionId: string; pid: number; workingDir: string }): Session {
  const now = Date.now();
  const branch = getGitBranch(event.workingDir);
  const worktree = getWorktreeBranch(event.workingDir);
  return {
    sessionId: event.sessionId,
    pid: event.pid,
    workingDir: event.workingDir,
    dirName: path.basename(event.workingDir),
    branch,
    worktree,
    status: 'idle',
    currentTool: null,
    lastTool: null,
    lastToolAt: null,
    currentTask: null,
    tasks: [],
    subagents: [],
    completionPct: 0,
    changedFiles: null,
    costUsd: null,
    errorState: false,
    loopTool: null,
    loopCount: 0,
    startedAt: now,
    lastActivity: now,
    dismissed: false,
  };
}

export function processHookEvent(event: HookEvent, sessionsFile: string): void {
  const sessions = readSessions(sessionsFile);
  const existing = sessions.find((s) => s.sessionId === event.sessionId);
  let session: Session = existing ?? makeNewSession(event);

  const now = Date.now();

  if (event.type === 'pre-tool') {
    let loopTool = session.loopTool;
    let loopCount = session.loopCount;
    if (loopTool === event.toolName) {
      loopCount++;
    } else {
      loopTool = event.toolName;
      loopCount = 1;
    }
    const newErrorState = loopCount >= LOOP_THRESHOLD ? true : session.errorState;
    session = { ...session, loopTool, loopCount, errorState: newErrorState };

    session = {
      ...session,
      status: 'active',
      currentTool: event.toolName,
      lastActivity: now,
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
      lastActivity: now,
      tasks,
      subagents,
      completionPct,
      currentTask,
    };
  } else if (event.type === 'stop') {
    session = {
      ...session,
      status: 'done',
      currentTool: null,
      lastActivity: now,
    };
  } else if (event.type === 'notification') {
    if (event.notificationType === 'permission_request') {
      session = { ...session, status: 'waiting_permission', lastActivity: now };
    } else if (event.notificationType === 'input_request') {
      session = { ...session, status: 'waiting_input', lastActivity: now };
    }
  }

  const updated = upsertSession(sessions, session);
  writeSessions(sessionsFile, updated);
}

// CLI entrypoint
if (require.main === module) {
  const eventType = process.argv[2] as HookEvent['type'];
  const sessionId = process.env.CLAUDE_SESSION_ID ?? 'unknown';
  const pid = process.pid;
  const workingDir = process.env.PWD ?? process.cwd();
  const sessionsFile = path.join(os.homedir(), '.claude', 'dashboard', 'sessions.json');

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

    let event: HookEvent;
    if (eventType === 'pre-tool') {
      event = {
        type: 'pre-tool',
        sessionId,
        pid,
        workingDir,
        toolName: (payload.tool_name as string) ?? '',
        input: (payload.tool_input as Record<string, unknown>) ?? {},
      };
    } else if (eventType === 'post-tool') {
      event = {
        type: 'post-tool',
        sessionId,
        pid,
        workingDir,
        toolName: (payload.tool_name as string) ?? '',
        input: (payload.tool_input as Record<string, unknown>) ?? {},
        output: (payload.tool_response as Record<string, unknown>) ?? {},
      };
    } else if (eventType === 'stop') {
      event = { type: 'stop', sessionId, pid, workingDir };
    } else {
      event = {
        type: 'notification',
        sessionId,
        pid,
        workingDir,
        message: (payload.message as string) ?? '',
        notificationType: payload.type as string | undefined,
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
