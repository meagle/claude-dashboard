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

export interface Session {
  sessionId: string;
  pid: number;
  termSessionId: string | null;  // iTerm2 TERM_SESSION_ID for window focusing
  workingDir: string;
  dirName: string;
  branch: string | null;
  worktree: string | null;
  status: 'active' | 'waiting_permission' | 'waiting_input' | 'idle' | 'done';
  currentTool: string | null;
  lastTool: string | null;
  lastToolAt: number | null;
  lastToolSummary: string | null;  // brief description of what the last tool did
  lastPrompt: string | null;       // last user prompt text
  lastMessage: string | null;      // last assistant text response
  currentTask: string | null;
  tasks: TaskSummary[];
  subagents: SubagentSummary[];
  completionPct: number;
  changedFiles: number | null;
  costUsd: number | null;
  turns: number | null;         // number of user turns in transcript
  model: string | null;
  contextPct: number | null;
  bashStartedAt: number | null; // epoch ms when a Bash tool started (for stuck detection)
  gitSummary: string | null;    // e.g. "3 files changed, +42 -7"
  gitAhead: number | null;      // commits ahead of upstream
  transcriptPath: string | null; // path to Claude transcript file
  partialResponse: string | null; // latest assistant text from current turn (streaming-like)
  errorState: boolean;
  loopTool: string | null;    // last tool seen in loop detection
  loopCount: number;           // consecutive same-tool count
  startedAt: number;
  turnStartedAt: number | null;  // epoch ms when the current/last Claude turn began
  lastActivity: number;
  dismissed: boolean;
}

export interface DashboardConfig {
  columns: {
    elapsedTime: boolean;
    gitBranch: boolean;
    changedFiles: boolean;
    cost: boolean;
    subagents: boolean;
    lastAction: boolean;
    compactPaths: boolean;
    doneFooter: boolean;
  };
  staleSessionMinutes: number;
  theme: 'dark' | 'light';
  notifications: boolean;
  notificationSound: boolean;
}

export const DEFAULT_CONFIG: DashboardConfig = {
  columns: {
    elapsedTime: true,
    gitBranch: true,
    changedFiles: true,
    cost: false,
    subagents: true,
    lastAction: true,
    compactPaths: true,
    doneFooter: false,
  },
  staleSessionMinutes: 30,
  theme: 'dark',
  notifications: true,
  notificationSound: true,
};
