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
  source?: 'claude-code' | 'desktop' | 'cursor' | 'codex';
}

export interface ModelPricingEntry {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
}

export const DEFAULT_CONTEXT_WINDOW = 200_000;

// Only models with non-200k context windows need entries here. These are exact
// model ids (matched via startsWith), so they are more specific than litellm's
// coarse family prefixes (e.g. "claude-opus-4") and win under the longest-prefix
// resolution in modelContextWindowFromConfig — important because litellm collapses
// every claude-opus-4-* into one 200k bucket, which would otherwise mis-size the
// 1M Opus 4.5–4.8 models.
export const KNOWN_CONTEXT_WINDOWS: Record<string, number> = {
  'claude-opus-4-8':   1_000_000,
  'claude-opus-4-7':   1_000_000,
  'claude-opus-4-6':   1_000_000,
  'claude-sonnet-4-6': 1_000_000,
  // Confirmed live: a real Sonnet 5 session showed 49% in Claude Code's own statusline
  // but 100% (capped) on the dashboard, since this model was missing here and fell back
  // to the 200k DEFAULT_CONTEXT_WINDOW.
  'claude-sonnet-5':   1_000_000,
};

// Resolves a model's context window by MOST-SPECIFIC prefix across all sources.
// Candidates come from user custom overrides, litellm-fetched windows, and the
// built-in KNOWN table; the longest matching prefix wins, breaking ties by source
// priority (custom > fetched > known). This ensures a specific entry like
// "claude-opus-4-8" (KNOWN, 1M) beats a coarse fetched family prefix like
// "claude-opus-4" (200k) — the previous tiered logic returned the first source
// with ANY match, so a coarse fetched prefix wrongly overrode a specific window.
export function modelContextWindowFromConfig(
  modelId: string,
  cfg?: DashboardConfig,
): number {
  const candidates: Array<{ prefix: string; window: number; priority: number }> = [];
  for (const e of cfg?.modelContextWindows?.custom ?? []) {
    if (modelId.startsWith(e.prefix)) candidates.push({ prefix: e.prefix, window: e.contextWindow, priority: 0 });
  }
  for (const [prefix, window] of Object.entries(cfg?.modelContextWindows?.fetched ?? {})) {
    if (modelId.startsWith(prefix)) candidates.push({ prefix, window, priority: 1 });
  }
  for (const [prefix, window] of Object.entries(KNOWN_CONTEXT_WINDOWS)) {
    if (modelId.startsWith(prefix)) candidates.push({ prefix, window, priority: 2 });
  }
  if (candidates.length === 0) return DEFAULT_CONTEXT_WINDOW;
  candidates.sort((a, b) => b.prefix.length - a.prefix.length || a.priority - b.priority);
  return candidates[0].window;
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
    agentChip?: boolean;
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
  openPanelOnLaunch?: boolean;
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
    agentChip: false,
    footerStyle: 'default',
  },
  staleSessionMinutes: 30,
  maxHeight: 700,
  theme: 'light',
  notifications: true,
  notificationSound: true,
  showBadgeCount: false,
  showDesktopPresence: true,
  openPanelOnLaunch: true,
  modelColors: {
    'claude-sonnet': { color: '#D97757', badgeStyle: 'A' },
    'claude-opus':   { color: '#D97757', badgeStyle: 'A' },
    'claude-haiku':  { color: '#D97757', badgeStyle: 'A' },
  },
};
