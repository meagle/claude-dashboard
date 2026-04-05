import React from 'react';
import { render } from 'ink-testing-library';
import { DetailView } from '../DetailView';
import { Session, DEFAULT_CONFIG } from '@claude-dashboard/shared';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-1',
    pid: 100,
    workingDir: '/Users/meagle/projects/myapp',
    dirName: 'myapp',
    branch: 'main',
    worktree: 'feature/auth',
    status: 'active',
    currentTool: 'Bash',
    lastTool: null,
    lastToolAt: null,
    currentTask: 'Fix auth bug',
    tasks: [
      { id: 't1', subject: 'Fix auth bug', status: 'in_progress' },
      { id: 't2', subject: 'Write tests', status: 'completed' },
    ],
    subagents: [{ id: 'a1', type: 'Explore', status: 'running' }],
    completionPct: 50,
    changedFiles: 4,
    costUsd: null,
    errorState: false,
    startedAt: Date.now() - 12 * 60 * 1000,
    lastActivity: Date.now(),
    dismissed: false,
    ...overrides,
  };
}

describe('DetailView', () => {
  it('renders full working directory path', () => {
    const { lastFrame } = render(
      <DetailView sessions={[makeSession()]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('/Users/meagle/projects/myapp');
  });

  it('renders worktree badge', () => {
    const { lastFrame } = render(
      <DetailView sessions={[makeSession()]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('🌿');
    expect(lastFrame()).toContain('feature/auth');
  });

  it('renders task counts', () => {
    const { lastFrame } = render(
      <DetailView sessions={[makeSession()]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('50%');
  });

  it('renders waiting_permission message for that status', () => {
    const { lastFrame } = render(
      <DetailView
        sessions={[makeSession({ status: 'waiting_permission', currentTool: null })]}
        selectedIdx={0}
        config={DEFAULT_CONFIG}
      />
    );
    expect(lastFrame()).toContain('Waiting for tool approval');
  });
});
