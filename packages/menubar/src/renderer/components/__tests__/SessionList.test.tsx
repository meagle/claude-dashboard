import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SessionList } from '../SessionList';
import { makeSession, defaultCardConfig } from './testUtils';


function renderList(sessions: ReturnType<typeof makeSession>[]) {
  return render(
    <SessionList sessions={sessions} cardConfig={defaultCardConfig} home="/Users/alice" />
  );
}

describe('SessionList', () => {
  it('renders empty state when no sessions', () => {
    renderList([]);
    expect(screen.getByText(/No active Claude sessions/)).toBeInTheDocument();
  });

  it('renders one card per session', () => {
    const sessions = [
      makeSession({ sessionId: 'a', dirName: 'alpha', lastPrompt: 'Task A' }),
      makeSession({ sessionId: 'b', dirName: 'beta', lastPrompt: 'Task B' }),
    ];
    const { container } = renderList(sessions);
    expect(container.querySelectorAll('[data-session]')).toHaveLength(2);
  });

  it('does not flash already-done sessions on first render', () => {
    const sessions = [makeSession({ sessionId: 'a', status: 'done', dirName: 'alpha' })];
    const { container } = renderList(sessions);
    const card = container.querySelector('[data-session="a"]');
    expect(card).toBeInTheDocument();
    expect(card!.className).not.toContain('animate-flash');
  });

  it('marks a session as newly-done when it transitions from non-done to done', () => {
    const session = makeSession({ sessionId: 'a', status: 'active', dirName: 'alpha' });
    const { container, rerender } = renderList([session]);
    rerender(
      <SessionList
        sessions={[{ ...session, status: 'done' }]}
        cardConfig={defaultCardConfig}
        home="/Users/alice"
      />
    );
    const card = container.querySelector('[data-session="a"]');
    expect(card!.className).toContain('animate-flash');
  });
});

describe('SessionList compact mode', () => {
  it('renders column header row in compact mode', () => {
    const sessions = [makeSession({ sessionId: 'a', dirName: 'alpha' })];
    render(
      <SessionList sessions={sessions} cardConfig={defaultCardConfig} home="/Users/alice" compactMode />
    );
    expect(screen.getByText('Status')).toBeInTheDocument();
    expect(screen.getByText('Project')).toBeInTheDocument();
    expect(screen.getByText('Task')).toBeInTheDocument();
    expect(screen.getByText('Tool')).toBeInTheDocument();
    expect(screen.getByText('Progress')).toBeInTheDocument();
  });

  it('renders dirName and status label in compact mode', () => {
    const sessions = [makeSession({ sessionId: 'a', dirName: 'my-project', status: 'active' })];
    render(
      <SessionList sessions={sessions} cardConfig={defaultCardConfig} home="/Users/alice" compactMode />
    );
    expect(screen.getByText('my-project')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
  });

  it('does not render data-session cards in compact mode', () => {
    const sessions = [makeSession({ sessionId: 'a', dirName: 'alpha' })];
    const { container } = render(
      <SessionList sessions={sessions} cardConfig={defaultCardConfig} home="/Users/alice" compactMode />
    );
    expect(container.querySelectorAll('[data-session]')).toHaveLength(0);
  });
});
