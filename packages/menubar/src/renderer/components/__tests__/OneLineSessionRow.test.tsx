import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { OneLineSessionRow } from '../OneLineSessionRow';
import { makeSession, defaultCardConfig } from './testUtils';

function renderRow(overrides: Parameters<typeof makeSession>[0] = {}) {
  const session = makeSession(overrides);
  const onFocus = vi.fn();
  const { container } = render(
    <OneLineSessionRow session={session} cardConfig={defaultCardConfig} onFocus={onFocus} />
  );
  return { session, onFocus, container };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-01-01T12:00:00Z'));
});

describe('OneLineSessionRow — content', () => {
  it('renders dirName', () => {
    renderRow({ dirName: 'my-project' });
    expect(screen.getByText('my-project')).toBeInTheDocument();
  });

  it('renders branch when showBranch is true', () => {
    renderRow({ branch: 'feature/new-ui' });
    expect(screen.getByText(/feature\/new-ui/)).toBeInTheDocument();
  });

  it('does not render branch when showBranch is false', () => {
    const { container } = render(
      <OneLineSessionRow
        session={makeSession({ branch: 'my-branch' })}
        cardConfig={{ ...defaultCardConfig, showBranch: false }}
        onFocus={vi.fn()}
      />
    );
    expect(container).not.toHaveTextContent('my-branch');
  });

  it('renders task text from lastPrompt', () => {
    renderRow({ lastPrompt: 'Write some tests' });
    expect(screen.getByText('Write some tests')).toBeInTheDocument();
  });

  it('prefers currentTask over lastPrompt when active', () => {
    renderRow({ status: 'active', currentTask: 'Active task', lastPrompt: 'Old prompt' });
    expect(screen.getByText('Active task')).toBeInTheDocument();
    expect(screen.queryByText('Old prompt')).not.toBeInTheDocument();
  });

  it('shows partialResponse when active with no currentTool', () => {
    renderRow({ status: 'active', partialResponse: 'Thinking…', lastPrompt: 'Do it', currentTool: null });
    expect(screen.getByText('Thinking…')).toBeInTheDocument();
  });

  it('does not show partialResponse when currentTool is set', () => {
    renderRow({ status: 'active', partialResponse: 'Thinking…', lastPrompt: 'Do it', currentTool: 'Bash' });
    expect(screen.getByText('Do it')).toBeInTheDocument();
    expect(screen.queryByText('Thinking…')).not.toBeInTheDocument();
  });

  it('shows lastMessage when done', () => {
    renderRow({ status: 'done', lastPrompt: 'Write a test', lastMessage: 'Done. Here it is.' });
    expect(screen.getByText('Done. Here it is.')).toBeInTheDocument();
    expect(screen.queryByText('Write a test')).not.toBeInTheDocument();
  });

  it('shows git changes indicator when gitSummary has file count', () => {
    renderRow({ gitSummary: '4 files changed' });
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows git ahead indicator when gitAhead is set', () => {
    renderRow({ gitAhead: 3 });
    expect(screen.getByText('↑3')).toBeInTheDocument();
  });

  it('does not show git changes when gitSummary is null', () => {
    const { container } = renderRow({ gitSummary: null });
    expect(container).not.toHaveTextContent('●');
  });

  it('renders context percentage when contextPct is set', () => {
    renderRow({ contextPct: 72 });
    expect(screen.getByText('72%')).toBeInTheDocument();
  });

  it('hides context percentage when contextPct is null and done', () => {
    renderRow({ status: 'done', contextPct: null });
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });
});

describe('OneLineSessionRow — time label', () => {
  it('shows elapsed time for active session', () => {
    renderRow({ status: 'active', turnStartedAt: Date.now() - 65000 });
    expect(screen.getByText('1m')).toBeInTheDocument();
  });

  it('shows ago time for done session', () => {
    renderRow({ status: 'done', lastActivity: Date.now() - 3 * 60000 });
    expect(screen.getByText('3m ago')).toBeInTheDocument();
  });
});

describe('OneLineSessionRow — interaction', () => {
  it('calls onFocus with pid and termSessionId when row is clicked', () => {
    const { onFocus } = renderRow({ pid: 42, termSessionId: 'term-abc' });
    fireEvent.click(screen.getByText('myproject'));
    expect(onFocus).toHaveBeenCalledWith(42, 'term-abc');
  });

  it('calls onFocus with null termSessionId when none set', () => {
    const { onFocus } = renderRow({ pid: 7, termSessionId: null });
    fireEvent.click(screen.getByText('myproject'));
    expect(onFocus).toHaveBeenCalledWith(7, null);
  });
});
