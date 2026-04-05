import { getTrayLabel, getTrayTooltip } from '../trayIcon';
import { Session } from '@claude-dashboard/shared';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-1',
    pid: 100,
    workingDir: '/tmp/test',
    dirName: 'test',
    branch: 'main',
    worktree: null,
    status: 'active',
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
    startedAt: Date.now(),
    lastActivity: Date.now(),
    dismissed: false,
    ...overrides,
  };
}

describe('getTrayLabel', () => {
  it('shows lock icon when any session needs permission', () => {
    const sessions = [makeSession({ status: 'waiting_permission' })];
    expect(getTrayLabel(sessions)).toBe('🔐 1');
  });

  it('shows question mark when any session waiting input (no permission)', () => {
    const sessions = [makeSession({ status: 'waiting_input' })];
    expect(getTrayLabel(sessions)).toBe('❓ 1');
  });

  it('shows robot when sessions active (no urgent states)', () => {
    const sessions = [makeSession({ status: 'active' })];
    expect(getTrayLabel(sessions)).toBe('🤖 1');
  });

  it('shows checkmark when all done', () => {
    const sessions = [makeSession({ status: 'done' })];
    expect(getTrayLabel(sessions)).toBe('✅');
  });

  it('permission takes priority over waiting_input', () => {
    const sessions = [
      makeSession({ status: 'waiting_permission' }),
      makeSession({ sessionId: 'sess-2', status: 'waiting_input' }),
    ];
    expect(getTrayLabel(sessions)).toBe('🔐 2');
  });

  it('returns empty string when no sessions', () => {
    expect(getTrayLabel([])).toBe('');
  });
});
