import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentChip } from '../AgentChip';
import { agentIdentity, FALLBACK_AGENT_COLOR } from '../../utils/agentIdentity';

describe('agentIdentity', () => {
  it('resolves name and color from the shared SOURCE_META', () => {
    expect(agentIdentity('claude-code')).toMatchObject({ name: 'Claude Code', color: '#D97757' });
    expect(agentIdentity('cursor')).toMatchObject({ name: 'Cursor', color: '#6b7cff' });
    expect(agentIdentity('codex')).toMatchObject({ name: 'Codex', color: '#10a37f' });
    expect(agentIdentity('desktop')).toMatchObject({ name: 'Claude Desktop' });
  });

  it('falls back agent-agnostically for an unknown or missing source', () => {
    // sessions.json written by a newer hook must not render as "Claude".
    expect(agentIdentity('some-future-agent')).toMatchObject({
      name: 'Agent',
      color: FALLBACK_AGENT_COLOR,
    });
    expect(agentIdentity(undefined)).toMatchObject({ name: 'Agent' });
  });

  it('gives every known source a glyph', () => {
    for (const source of ['claude-code', 'cursor', 'codex', 'desktop', 'nope']) {
      expect(agentIdentity(source).icon).toBeTruthy();
    }
  });
});

describe('AgentChip', () => {
  it('shows the agent name for a known source', () => {
    render(<AgentChip source="cursor" />);
    expect(screen.getByTestId('agent-chip')).toHaveTextContent('Cursor');
  });

  it('tints itself with the agent color', () => {
    render(<AgentChip source="codex" />);
    expect(screen.getByTestId('agent-chip')).toHaveStyle({ color: '#10a37f' });
  });

  it('hides the label but keeps the name accessible when compact', () => {
    render(<AgentChip source="cursor" compact />);
    const chip = screen.getByTestId('agent-chip');
    expect(chip).not.toHaveTextContent('Cursor');
    expect(chip).toHaveAttribute('aria-label', 'Cursor');
  });

  it('renders "Agent" rather than a Claude label for an unknown source', () => {
    render(<AgentChip source="some-future-agent" />);
    expect(screen.getByTestId('agent-chip')).toHaveTextContent('Agent');
  });
});
