import { SessionRow, CardConfig } from '../../types';

export function makeSession(overrides: Partial<SessionRow> = {}): SessionRow {
  const now = Date.now();
  return {
    sessionId: 'sess-1',
    pid: 100,
    termSessionId: null,
    workingDir: '/Users/alice/code/myproject',
    dirName: 'myproject',
    branch: 'main',
    worktree: null,
    status: 'active',
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
    costUsd: null,
    turns: null,
    toolCount: 0,
    totalTokens: null,
    model: null,
    contextPct: null,
    bashStartedAt: null,
    gitSummary: null,
    transcriptPath: null,
    partialResponse: null,
    errorState: false,
    loopTool: null,
    loopCount: 0,
    startedAt: now,
    turnStartedAt: now,
    lastActivity: now,
    dismissed: false,
    ...overrides,
  };
}

export const defaultCardConfig: CardConfig = {
  showBranch: true,
  showGitSummary: true,
  showSubagents: true,
  showModel: true,
  compactPaths: true,
  showCost: false,
};
