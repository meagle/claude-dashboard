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
  workingDir: string;
  dirName: string;
  branch: string | null;
  worktree: string | null;
  status: 'active' | 'waiting_permission' | 'waiting_input' | 'idle' | 'done';
  currentTool: string | null;
  lastTool: string | null;
  lastToolAt: number | null;
  currentTask: string | null;
  tasks: TaskSummary[];
  subagents: SubagentSummary[];
  completionPct: number;
  changedFiles: number | null;
  costUsd: number | null;
  errorState: boolean;
  loopTool: string | null;    // last tool seen in loop detection
  loopCount: number;           // consecutive same-tool count
  startedAt: number;
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
  };
  staleSessionMinutes: number;
  theme: 'dark' | 'light';
}

export const DEFAULT_CONFIG: DashboardConfig = {
  columns: {
    elapsedTime: true,
    gitBranch: true,
    changedFiles: true,
    cost: false,
    subagents: true,
    lastAction: true,
  },
  staleSessionMinutes: 30,
  theme: 'dark',
};
