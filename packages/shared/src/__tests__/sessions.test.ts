import { Session, TaskSummary, SubagentSummary } from '../types';

describe('Session type shape', () => {
  it('accepts a valid session object', () => {
    const session: Session = {
      sessionId: 'abc123',
      pid: 1234,
      workingDir: '/Users/meagle/projects/myapp',
      dirName: 'myapp',
      branch: 'main',
      worktree: null,
      status: 'active',
      currentTool: 'Bash',
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
    };
    expect(session.sessionId).toBe('abc123');
    expect(session.status).toBe('active');
  });

  it('accepts all valid status values', () => {
    const statuses: Session['status'][] = [
      'active', 'waiting_permission', 'waiting_input', 'idle', 'done'
    ];
    expect(statuses).toHaveLength(5);
  });
});
