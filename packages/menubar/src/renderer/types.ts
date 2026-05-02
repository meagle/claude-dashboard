export interface TaskSummary {
  id: string;
  subject: string;
  status: 'pending' | 'in_progress' | 'completed';
}

export interface SubagentSummary {
  id: string;
  type: string;
  status: 'running' | 'done';
}

export interface SessionRow {
  sessionId: string;
  pid: number;
  termSessionId: string | null;
  workingDir: string;
  dirName: string;
  branch: string | null;
  worktree: string | null;
  status: 'active' | 'waiting_permission' | 'waiting_input' | 'idle' | 'done';
  currentTool: string | null;
  lastTool: string | null;
  lastToolAt: number | null;
  lastToolSummary: string | null;
  lastPrompt: string | null;
  lastMessage: string | null;
  currentTask: string | null;
  tasks: TaskSummary[];
  subagents: SubagentSummary[];
  completionPct: number;
  costUsd: number | null;
  turns: number | null;
  toolCount: number;
  totalTokens: number | null;
  model: string | null;
  contextPct: number | null;
  bashStartedAt: number | null;
  gitSummary: string | null;
  gitAhead: number | null;
  transcriptPath: string | null;
  partialResponse: string | null;
  errorState: boolean;
  loopTool: string | null;
  loopCount: number;
  startedAt: number;
  turnStartedAt: number | null;
  lastActivity: number;
  dismissed: boolean;
  appName?: string | null;
}

export interface HistoryRow extends SessionRow {
  archivedAt: number;
}

export interface CardConfig {
  showBranch: boolean;
  showGitSummary: boolean;
  showSubagents: boolean;
  showModel: boolean;
  compactPaths: boolean;
  showCost: boolean;
  showDoneFooter: boolean;
  showContextInMeta: boolean;
  theme: 'light' | 'dark';
}

export interface DashboardConfig {
  columns: {
    gitBranch: boolean;
    changedFiles: boolean;
    subagents: boolean;
    lastAction: boolean;
    compactPaths: boolean;
    cost: boolean;
    doneFooter: boolean;
  };
  staleSessionMinutes: number;
  maxHeight: number;
  theme: 'light' | 'dark';
  notifications: boolean;
  notificationSound: boolean;
}
