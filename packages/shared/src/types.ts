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
  toolCount: number;            // total pre-tool events fired this session
  totalTokens: number | null;   // cumulative input + output tokens across all turns
  model: string | null;
  modelId: string | null;
  contextPct: number | null;
  contextTokens: number | null;
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
  appName?: string | null;
  source?: 'claude-code' | 'desktop';
}

export interface ModelPricingEntry {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export const DEFAULT_CONTEXT_WINDOW = 200_000;

// Only models with non-200k context windows need entries here.
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-7':   1_000_000,
  'claude-opus-4-6':   1_000_000,
  'claude-sonnet-4-6': 1_000_000,
};

export function modelContextWindowFromConfig(
  modelId: string,
  cfg?: DashboardConfig,
): number {
  if (cfg?.modelContextWindows?.custom) {
    const sorted = [...cfg.modelContextWindows.custom].sort(
      (a, b) => b.prefix.length - a.prefix.length,
    );
    const match = sorted.find((e) => modelId.startsWith(e.prefix));
    if (match) return match.contextWindow;
  }
  if (cfg?.modelContextWindows?.fetched) {
    const sorted = Object.entries(cfg.modelContextWindows.fetched).sort(
      (a, b) => b[0].length - a[0].length,
    );
    const match = sorted.find(([prefix]) => modelId.startsWith(prefix));
    if (match) return match[1];
  }
  return KNOWN_CONTEXT_WINDOWS[modelId] ?? DEFAULT_CONTEXT_WINDOW;
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
    contextInHeader?: boolean;
    footerStyle: 'default' | 'grid';
  };
  staleSessionMinutes: number;
  maxHeight: number;
  theme: 'light' | 'dark';
  notifications: boolean;
  notificationSound: boolean;
  showBadgeCount: boolean;
  showDesktopPresence?: boolean;
  pinnedPanelOpacity?: number;
  collapsedAlwaysOpaque?: boolean;
  modelPricing?: {
    fetched: Record<string, ModelPricingEntry>;
    custom: Array<{ prefix: string } & ModelPricingEntry>;
    fetchedAt?: number;
  };
  modelContextWindows?: {
    fetched: Record<string, number>;
    custom: Array<{ prefix: string; contextWindow: number }>;
    fetchedAt?: number;
  };
  modelColors?: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
}

export interface ArchivedSession extends Session {
  archivedAt: number;  // epoch ms when archived
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
    doneFooter: true,
    contextInHeader: false,
    footerStyle: 'default',
  },
  staleSessionMinutes: 30,
  maxHeight: 700,
  theme: 'light',
  notifications: true,
  notificationSound: true,
  showBadgeCount: false,
  showDesktopPresence: true,
  modelColors: {
    'claude-sonnet': { color: '#D97757', badgeStyle: 'A' },
    'claude-opus':   { color: '#D97757', badgeStyle: 'A' },
    'claude-haiku':  { color: '#D97757', badgeStyle: 'A' },
  },
};
