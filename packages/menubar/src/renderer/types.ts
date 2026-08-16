// Canonical types live in packages/shared/src/types.ts. The renderer imports them
// through the types-only `@claude-dashboard/shared/types` subpath (aliased in
// vite.config.ts) so it never pulls in shared's Node.js runtime deps (fs, chokidar).
export type {
  Session, TaskSummary, SubagentSummary, ModelPricingEntry, DashboardConfig,
} from '@claude-dashboard/shared/types';
import type { Session } from '@claude-dashboard/shared/types';

// SessionRow is kept as the name components already import; Session is a superset
// of the old hand-rolled SessionRow (it adds fields like changedFiles).
export type SessionRow = Session;

export interface HistoryRow extends Session {
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
  footerStyle: 'default' | 'grid';
  theme: 'light' | 'dark';
  pinnedPanelOpacity: number;
  collapsedAlwaysOpaque: boolean;
  showDesktopPresence: boolean;
  modelColors: Record<string, { color: string; badgeStyle: 'A' | 'B' | 'C' }>;
}
