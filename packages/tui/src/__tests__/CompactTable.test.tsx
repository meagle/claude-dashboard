import React from 'react';
import { render } from 'ink-testing-library';
import { CompactTable } from '../CompactTable';
import { Session, DEFAULT_CONFIG } from '@claude-dashboard/shared';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    sessionId: 'sess-1',
    pid: 100,
    workingDir: '/tmp/myapp',
    dirName: 'myapp',
    branch: 'main',
    worktree: null,
    status: 'active',
    currentTool: 'Bash',
    lastTool: null,
    lastToolAt: null,
    currentTask: 'Fix auth bug',
    tasks: [
      { id: 't1', subject: 'Fix auth bug', status: 'in_progress' },
      { id: 't2', subject: 'Write tests', status: 'pending' },
    ],
    subagents: [],
    completionPct: 0,
    changedFiles: 4,
    costUsd: null,
    errorState: false,
    startedAt: Date.now() - 5 * 60 * 1000,
    lastActivity: Date.now(),
    dismissed: false,
    ...overrides,
  };
}

describe('CompactTable', () => {
  it('renders project name', () => {
    const { lastFrame } = render(
      <CompactTable sessions={[makeSession()]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('myapp');
  });

  it('renders worktree badge for worktree sessions', () => {
    const { lastFrame } = render(
      <CompactTable
        sessions={[makeSession({ worktree: 'feature/auth' })]}
        selectedIdx={0}
        config={DEFAULT_CONFIG}
      />
    );
    expect(lastFrame()).toContain('🌿');
    expect(lastFrame()).toContain('feature/auth');
  });

  it('renders current tool', () => {
    const { lastFrame } = render(
      <CompactTable sessions={[makeSession()]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('Bash');
  });

  it('renders current task', () => {
    const { lastFrame } = render(
      <CompactTable sessions={[makeSession()]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('Fix auth bug');
  });

  it('shows ±N files when changedFiles config enabled', () => {
    const { lastFrame } = render(
      <CompactTable sessions={[makeSession()]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('±4');
  });

  it('shows no active sessions message when empty', () => {
    const { lastFrame } = render(
      <CompactTable sessions={[]} selectedIdx={0} config={DEFAULT_CONFIG} />
    );
    expect(lastFrame()).toContain('no sessions');
  });
});
