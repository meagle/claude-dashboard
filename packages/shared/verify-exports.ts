import {
  TaskSummary,
  SubagentSummary,
  Session,
  DashboardConfig,
  DEFAULT_CONFIG
} from './src/index';

// Verify TaskSummary
const taskSummary: TaskSummary = {
  id: 'test',
  subject: 'test',
  status: 'pending'
};

// Verify SubagentSummary
const subagentSummary: SubagentSummary = {
  id: 'test',
  type: 'test',
  status: 'running'
};

// Verify Session has all 20 fields
const session: Session = {
  sessionId: 'test',
  pid: 123,
  workingDir: '/test',
  dirName: 'test',
  branch: 'main',
  worktree: null,
  status: 'active',
  currentTool: 'Test',
  lastTool: null,
  lastToolAt: null,
  currentTask: null,
  tasks: [],
  subagents: [],
  completionPct: 0,
  changedFiles: null,
  costUsd: null,
  errorState: false,
  startedAt: Date.now(),
  lastActivity: Date.now(),
  dismissed: false
};

// Verify DashboardConfig
const config: DashboardConfig = DEFAULT_CONFIG;

console.log('All exports verified successfully!');
console.log('DEFAULT_CONFIG:', JSON.stringify(DEFAULT_CONFIG, null, 2));
