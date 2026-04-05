import {
  TaskSummary,
  SubagentSummary,
  Session,
  DashboardConfig,
  DEFAULT_CONFIG
} from './index';

// Check 1: TaskSummary has correct fields
const checkTaskSummary = (ts: TaskSummary) => {
  console.log('✓ TaskSummary has id:', typeof ts.id === 'string');
  console.log('✓ TaskSummary has subject:', typeof ts.subject === 'string');
  console.log('✓ TaskSummary has status:', ['pending', 'in_progress', 'completed'].includes(ts.status));
};

// Check 2: SubagentSummary has correct fields
const checkSubagentSummary = (ss: SubagentSummary) => {
  console.log('✓ SubagentSummary has id:', typeof ss.id === 'string');
  console.log('✓ SubagentSummary has type:', typeof ss.type === 'string');
  console.log('✓ SubagentSummary has status:', ['running', 'done'].includes(ss.status));
};

// Check 3: Session has all 20 fields
const checkSession = (s: Session) => {
  const fields = [
    'sessionId', 'pid', 'workingDir', 'dirName', 'branch', 'worktree',
    'status', 'currentTool', 'lastTool', 'lastToolAt', 'currentTask',
    'tasks', 'subagents', 'completionPct', 'changedFiles', 'costUsd',
    'errorState', 'startedAt', 'lastActivity', 'dismissed'
  ];
  const sessionKeys = Object.keys(s);
  console.log('✓ Session field count:', sessionKeys.length, '(expected 20)');
  fields.forEach(f => {
    console.log(`  - ${f}: ${f in s ? '✓' : '✗'}`);
  });
  console.log('✓ Session status values are valid:', ['active', 'waiting_permission', 'waiting_input', 'idle', 'done'].includes(s.status));
};

// Check 4: DashboardConfig structure
const checkDashboardConfig = (c: DashboardConfig) => {
  console.log('✓ DashboardConfig has columns:', 'columns' in c);
  console.log('  - elapsedTime:', c.columns.elapsedTime);
  console.log('  - gitBranch:', c.columns.gitBranch);
  console.log('  - changedFiles:', c.columns.changedFiles);
  console.log('  - cost:', c.columns.cost);
  console.log('  - subagents:', c.columns.subagents);
  console.log('  - lastAction:', c.columns.lastAction);
  console.log('✓ DashboardConfig has staleSessionMinutes:', c.staleSessionMinutes);
  console.log('✓ DashboardConfig has theme:', c.theme);
};

// Check 5: DEFAULT_CONFIG values
console.log('\n=== SPEC COMPLIANCE CHECKS ===\n');
console.log('DEFAULT_CONFIG values:');
console.log('  columns.cost = false:', DEFAULT_CONFIG.columns.cost === false);
console.log('  columns.elapsedTime = true:', DEFAULT_CONFIG.columns.elapsedTime === true);
console.log('  columns.gitBranch = true:', DEFAULT_CONFIG.columns.gitBranch === true);
console.log('  columns.changedFiles = true:', DEFAULT_CONFIG.columns.changedFiles === true);
console.log('  columns.subagents = true:', DEFAULT_CONFIG.columns.subagents === true);
console.log('  columns.lastAction = true:', DEFAULT_CONFIG.columns.lastAction === true);
console.log('  staleSessionMinutes = 30:', DEFAULT_CONFIG.staleSessionMinutes === 30);
console.log('  theme = dark:', DEFAULT_CONFIG.theme === 'dark');
