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
    expect(container.querySelectorAll('.card')).toHaveLength(2);
  });

  it('marks newly-done sessions with newly-done class on first render', () => {
    const sessions = [makeSession({ sessionId: 'a', status: 'done', dirName: 'alpha' })];
    const { container } = renderList(sessions);
    expect(container.querySelector('.newly-done')).toBeInTheDocument();
  });

  it('does not mark session as newly-done if it was already present', () => {
    const session = makeSession({ sessionId: 'a', status: 'active', dirName: 'alpha' });
    const { container, rerender } = renderList([session]);
    // Re-render with same session now done
    rerender(
      <SessionList
        sessions={[{ ...session, status: 'done' }]}
        cardConfig={defaultCardConfig}
        home="/Users/alice"
      />
    );
    // Was already tracked, so not newly-done
    expect(container.querySelector('.newly-done')).not.toBeInTheDocument();
  });
});
